/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import { PATCH } from '@/app/api/instructor/courses/[courseId]/route';
import { prisma } from '@/lib/prisma';
import { getStudentInstructors } from '@/lib/studentCourses';

const databaseUrl = process.env.CONTACTS_TEST_DATABASE_URL;
if (
  databaseUrl &&
  (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname) ||
    new URL(databaseUrl).pathname !== '/spark_contacts_test' ||
    process.env.DATABASE_URL !== databaseUrl)
)
  throw new Error('Dedicated local contacts test DB required');

const suite = databaseUrl ? describe : describe.skip;
suite('course contacts in PostgreSQL', () => {
  jest.setTimeout(30000);
  const courseIds: string[] = [];
  let studentId: string;
  let courseId: string;
  let checkerId: string;
  let otherContactId: string;
  const owner = `contact-test-${randomUUID()}`;

  beforeAll(async () => {
    mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: owner }));
    studentId = (await prisma.user.create({ data: { email: `${owner}@example.com` } })).id;
    const enrolled = await prisma.course.create({
      data: {
        code: `${owner}-enrolled`,
        title: 'Enrolled course',
        createdByClerkId: owner,
        enrollments: { create: { studentId } },
        contacts: {
          create: { type: 'CHECKER', name: 'Checker', email: 'checker@example.com', avatarUrl: '/checker.png' },
        },
      },
      include: { contacts: true },
    });
    courseId = enrolled.id;
    checkerId = enrolled.contacts[0].id;
    courseIds.push(courseId);
    const outside = await prisma.course.create({
      data: {
        code: `${owner}-outside`,
        title: 'Outside course',
        createdByClerkId: owner,
        contacts: {
          create: { type: 'INSTRUCTOR', name: 'Outside', email: 'outside@example.com', officeHours: 'Private hours' },
        },
      },
      include: { contacts: true },
    });
    courseIds.push(outside.id);
    otherContactId = outside.contacts[0].id;
    const nonStudent = await prisma.course.create({
      data: {
        code: `${owner}-checker`,
        title: 'Checker enrollment',
        createdByClerkId: owner,
        enrollments: { create: { studentId, role: 'CHECKER' } },
        contacts: { create: { type: 'INSTRUCTOR', name: 'Not a student here', email: 'hidden@example.com' } },
      },
    });
    courseIds.push(nonStudent.id);
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    if (studentId) await prisma.user.delete({ where: { id: studentId } });
    await prisma.$disconnect();
  });

  async function patch(instructorContacts: unknown) {
    return PATCH({ json: async () => ({ instructorContacts }) } as never, {
      params: Promise.resolve({ courseId }),
    });
  }

  it('saves, reads, edits, clears, and removes hours while preserving checkers and enrollment boundaries', async () => {
    const saved = await patch([
      { name: 'Jane', email: ' JANE@example.com ', officeHours: ' Mondays · SCI 201 · 2–4 PM ' },
      { name: 'Ali', email: 'ali@example.com' },
    ]);
    expect(saved.status).toBe(200);
    const instructors = await getStudentInstructors(studentId);
    expect(instructors).toHaveLength(2);
    expect(instructors.map((contact) => contact.email).sort()).toEqual(['ali@example.com', 'jane@example.com']);
    const jane = instructors.find((contact) => contact.email === 'jane@example.com')!;
    expect(jane.officeHours).toBe('Mondays · SCI 201 · 2–4 PM');
    expect(jane.course.title).toBe('Enrolled course');

    // Updating must preserve the durable contact identity and unrelated metadata.
    await prisma.courseContact.update({ where: { id: jane.id }, data: { avatarUrl: '/jane.png' } });
    expect(
      (await patch([{ id: jane.id, name: 'Jane', email: jane.email, officeHours: 'Fridays, 3–4 PM' }])).status
    ).toBe(200);
    expect(await getStudentInstructors(studentId)).toEqual([
      expect.objectContaining({ id: jane.id, officeHours: 'Fridays, 3–4 PM' }),
    ]);
    expect(await prisma.courseContact.findUnique({ where: { id: jane.id } })).toMatchObject({ avatarUrl: '/jane.png' });

    expect((await patch([{ id: jane.id, name: 'Jane', email: jane.email, officeHours: '' }])).status).toBe(200);
    expect((await getStudentInstructors(studentId))[0].officeHours).toBeNull();
    expect((await patch([])).status).toBe(200);
    expect(await getStudentInstructors(studentId)).toEqual([]);
    expect(await prisma.courseContact.findMany({ where: { courseId } })).toEqual([
      expect.objectContaining({ id: checkerId, type: 'CHECKER', avatarUrl: '/checker.png' }),
    ]);
  });

  it('rejects checker and foreign-course IDs without changing either record', async () => {
    for (const id of [checkerId, otherContactId]) {
      expect(
        (await patch([{ id, name: 'Changed', email: 'changed@example.com', officeHours: 'Changed' }])).status
      ).toBe(422);
    }
    expect(await prisma.courseContact.findUnique({ where: { id: checkerId } })).toMatchObject({ name: 'Checker' });
    expect(await prisma.courseContact.findUnique({ where: { id: otherContactId } })).toMatchObject({
      name: 'Outside',
      officeHours: 'Private hours',
    });
  });
});
