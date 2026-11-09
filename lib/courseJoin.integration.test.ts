/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
import { POST as join } from '@/app/api/student/courses/join/route';
import { POST as generate, DELETE as disable } from '@/app/api/instructor/courses/[courseId]/join-code/route';
import { GET as listCourses } from '@/app/api/instructor/courses/route';
import { prisma } from '@/lib/prisma';
import { getStudentCourse } from '@/lib/studentCourses';
import { getStudentLessonRoadmap } from '@/lib/studentLessonRoadmap';

jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));

const databaseUrl = process.env.COURSE_JOIN_TEST_DATABASE_URL;
if (
  databaseUrl &&
  (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname) ||
    new URL(databaseUrl).pathname !== '/spark_course_join_test' ||
    process.env.DATABASE_URL !== databaseUrl)
) {
  throw new Error('Dedicated local course join test DB required');
}

const suite = databaseUrl ? describe : describe.skip;
suite('course join codes in PostgreSQL', () => {
  const owner = appUser({ clerkUserId: randomUUID() });
  const origin = 'http://localhost:3000';
  const previousOrigins = process.env.APP_ORIGINS;
  const students: string[] = [];
  const courses: string[] = [];
  let lessonId: string | undefined;

  beforeAll(() => {
    process.env.APP_ORIGINS = origin;
  });

  afterAll(async () => {
    if (previousOrigins === undefined) delete process.env.APP_ORIGINS;
    else process.env.APP_ORIGINS = previousOrigins;
    await prisma.course.deleteMany({ where: { id: { in: courses } } });
    if (lessonId) await prisma.lesson.delete({ where: { id: lessonId } });
    await prisma.user.deleteMany({ where: { id: { in: students } } });
    await prisma.$disconnect();
  });

  async function createCourse(createdByClerkId: string | null = owner.clerkUserId) {
    const { id } = await prisma.course.create({ data: { code: randomUUID(), title: 'Chemistry', createdByClerkId } });
    courses.push(id);
    return id;
  }

  async function createStudent() {
    const student = await prisma.user.create({
      data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.com`, appRole: 'STUDENT' },
    });
    students.push(student.id);
    return appUser({ ...student, clerkUserId: student.clerkUserId! });
  }

  function manage(courseId: string, method: 'POST' | 'DELETE' = 'POST') {
    const request = new Request(`${origin}/api/instructor/courses/${courseId}/join-code`, {
      method,
      headers: { origin },
    });
    return (method === 'POST' ? generate : disable)(request, { params: Promise.resolve({ courseId }) });
  }

  function redeem(code: unknown, requestOrigin = origin) {
    return join(
      new Request(`${origin}/api/student/courses/join`, {
        method: 'POST',
        headers: { origin: requestOrigin },
        body: JSON.stringify({ code, studentId: 'untrusted-id' }),
      })
    );
  }

  it('enrolls an unregistered student once under concurrent requests and grants roadmap access', async () => {
    const courseId = await createCourse();
    const student = await createStudent();
    const assignment = await prisma.courseLesson.create({
      data: { course: { connect: { id: courseId } }, lesson: { create: { title: 'Atoms', summary: 'Intro' } } },
    });
    lessonId = assignment.lessonId;
    expect(await getStudentLessonRoadmap(student.id, courseId, assignment.id)).toBeNull();

    mockGetAppUser.mockResolvedValue(owner);
    const generated = await manage(courseId);
    expect(generated.status).toBe(200);
    const { code } = await generated.json();
    expect(code).toMatch(/^[A-Z]{8}$/);
    expect(await (await listCourses()).text()).not.toContain(code);

    mockGetAppUser.mockResolvedValue(student);
    const results = await Promise.all([redeem(` ${code.toLowerCase()} `), redeem(code)]);
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ courseId });
    }
    expect(await prisma.enrollment.findMany({ where: { courseId }, select: { studentId: true, role: true } })).toEqual([
      { studentId: student.id, role: 'STUDENT' },
    ]);
    expect(await getStudentCourse(student.id, courseId)).toMatchObject({ id: courseId });
    expect(await getStudentLessonRoadmap(student.id, courseId, assignment.id)).toMatchObject({ lessonTitle: 'Atoms' });

    mockGetAppUser.mockResolvedValue(owner);
    const rotated = await manage(courseId);
    expect(rotated.status).toBe(200);
    const { code: replacement } = await rotated.json();
    expect(replacement).not.toBe(code);
    mockGetAppUser.mockResolvedValue(student);
    expect((await redeem(code)).status).toBe(404);
    expect((await redeem(replacement)).status).toBe(200);
    mockGetAppUser.mockResolvedValue(owner);
    expect(await (await manage(courseId, 'DELETE')).json()).toEqual({ code: null });
    mockGetAppUser.mockResolvedValue(student);
    expect((await redeem(replacement)).status).toBe(404);
    expect(await getStudentCourse(student.id, courseId)).toMatchObject({ id: courseId });
  });

  it('restricts code management to owners and admins, and preserves existing course roles', async () => {
    const courseId = await createCourse();
    const legacyCourse = await createCourse(null);
    mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: randomUUID() }));
    expect((await manage(courseId)).status).toBe(404);
    expect((await manage(legacyCourse)).status).toBe(404);
    mockGetAppUser.mockResolvedValue(appUser({ platformRole: 'ADMIN' }));
    expect((await manage(legacyCourse)).status).toBe(200);
    const { code } = await (await manage(courseId)).json();

    const student = await createStudent();
    await prisma.enrollment.create({ data: { studentId: student.id, courseId, role: 'CHECKER' } });
    mockGetAppUser.mockResolvedValue(student);
    expect((await manage(courseId)).status).toBe(403);
    expect((await redeem(code, 'https://example.com')).status).toBe(403);
    expect((await redeem('ABCD1234')).status).toBe(400);
    expect((await redeem(code)).status).toBe(409);
    expect(
      await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId } } })
    ).toMatchObject({ role: 'CHECKER' });
  });

  it('limits concurrent guesses and allows attempts again after the window expires', async () => {
    const student = await createStudent();
    mockGetAppUser.mockResolvedValue(student);
    const statuses = await Promise.all(Array.from({ length: 11 }, async () => (await redeem('AAAAAAAA')).status));
    expect(statuses.filter((status) => status === 404)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
    await prisma.courseJoinRateLimit.update({
      where: { studentId: student.id },
      data: { windowExpiresAt: new Date(0) },
    });
    expect((await redeem('AAAAAAAA')).status).toBe(404);
  });
});
