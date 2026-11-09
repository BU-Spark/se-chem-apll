/* eslint-disable @typescript-eslint/no-explicit-any */
import { workNode, workAttempt } from '@/test/mocks/work';
import {
  courseProgressPercent,
  findCurrentLesson,
  getEnrolledCourses,
  getStudentCourse,
  getStudentInstructors,
  type StudentLesson,
} from './studentCourses';

const mockEnrollmentFindMany = jest.fn();
const mockEnrollmentFindFirst = jest.fn();
const mockContactFindMany = jest.fn();

// Older course fixtures describe only outcomes; fill the content identity required by the readers.
const hydrateCourse = (course: any) => ({
  ...course,
  courseLessons: course.courseLessons.map((cl: any) => {
    const nodes = cl.lesson.lessonNodes.map((n: any) => ({ ...workNode(n.id, n.id, n.isRequired), ...n }));
    return {
      ...cl,
      lesson: { ...cl.lesson, lessonNodes: nodes },
      progress: cl.progress.map((p: any) => ({
        ...p,
        submissions: p.status === 'COMPLETED' ? [{ id: 'submission' }] : [],
        attempts: p.attempts.map((a: any, i: number) =>
          workAttempt(
            nodes.find((n: any) => n.id === a.lessonNodeId),
            { ...a, id: `attempt-${i}` }
          )
        ),
      })),
    };
  }),
});
jest.mock('@/lib/prisma', () => ({
  prisma: {
    enrollment: {
      findMany: async (...args: unknown[]) =>
        (await mockEnrollmentFindMany(...args)).map((e: any) => ({ course: hydrateCourse(e.course) })),
      findFirst: async (...args: unknown[]) => {
        const e = await mockEnrollmentFindFirst(...args);
        return e ? { course: hydrateCourse(e.course) } : null;
      },
    },
    courseContact: { findMany: (...args: unknown[]) => mockContactFindMany(...args) },
  },
}));

describe('getEnrolledCourses', () => {
  it("returns the student's courses with progress from their visible lessons", async () => {
    mockEnrollmentFindMany.mockResolvedValue([
      {
        course: {
          id: 'c1',
          title: 'Chem',
          description: null,
          courseLessons: [
            {
              id: 'a',
              dueDate: null,
              hideAfterDue: false,
              lesson: { title: 'A', lessonNodes: [{ id: 'n1', isRequired: true }] },
              progress: [{ status: 'COMPLETED', attempts: [] }],
            },
            {
              id: 'b',
              dueDate: null,
              hideAfterDue: false,
              lesson: { title: 'B', lessonNodes: [{ id: 'n2', isRequired: true }] },
              progress: [],
            },
            {
              id: 'hidden',
              dueDate: new Date('2026-01-01T00:00:00Z'),
              hideAfterDue: true,
              lesson: { title: 'Hidden', lessonNodes: [] },
              progress: [{ status: 'COMPLETED', attempts: [] }],
            },
          ],
        },
      },
    ]);

    expect(await getEnrolledCourses('student-1', new Date('2026-10-17T12:00:00Z'))).toEqual([
      { id: 'c1', title: 'Chem', description: null, progressPercent: 50 },
    ]);
    expect(mockEnrollmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: 'student-1', role: 'STUDENT' } })
    );
  });
});

describe('courseProgressPercent', () => {
  const lesson = (nodeCount: number, finishedNodeCount: number): StudentLesson => ({
    id: 'l',
    number: 1,
    title: '',
    status: 'IN_PROGRESS',
    nodeCount,
    finishedNodeCount,
  });

  it('is finished nodes out of all nodes in the course, rounded', () => {
    expect(courseProgressPercent([lesson(5, 3), lesson(1, 0)])).toBe(50);
    expect(courseProgressPercent([lesson(2, 1), lesson(1, 0)])).toBe(33);
    expect(courseProgressPercent([lesson(2, 2), lesson(1, 1)])).toBe(100);
  });

  it('is 0 for a course without nodes', () => {
    expect(courseProgressPercent([])).toBe(0);
    expect(courseProgressPercent([lesson(0, 0)])).toBe(0);
  });
});

describe('getStudentInstructors', () => {
  it('keeps course-specific hours for the same instructor across enrolled courses', async () => {
    mockContactFindMany.mockResolvedValue([
      {
        id: 'a',
        name: 'Jane Smith',
        email: 'janesmith@bu.edu',
        officeHours: 'Monday, SCI 201, 2–4 PM',
        course: { code: 'CH101', section: 'A1', title: 'Chemistry' },
      },
      {
        id: 'b',
        name: 'Jane Smith',
        email: 'janesmith@bu.edu',
        officeHours: 'Friday, SCI 202, 1–2 PM',
        course: { code: 'CH102', section: null, title: 'Chemistry II' },
      },
      { id: 'c', name: 'Ali Khan', email: 'alikhan@bu.edu' },
    ]);

    const instructors = await getStudentInstructors('student-1');
    expect(instructors.map((instructor) => instructor.id)).toEqual(['a', 'b', 'c']);
    expect(instructors[0].officeHours).toContain('Monday');
    expect(instructors[1].officeHours).toContain('Friday');
    expect(mockContactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: 'INSTRUCTOR',
          course: { enrollments: { some: { studentId: 'student-1', role: 'STUDENT' } } },
        },
        select: {
          id: true,
          name: true,
          email: true,
          officeHours: true,
          course: { select: { code: true, section: true, title: true } },
        },
      })
    );
  });
});

describe('getStudentCourse', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const courseLesson = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    dueDate: null,
    hideAfterDue: false,
    lesson: { title: `Title ${id}`, lessonNodes: [] },
    progress: [],
    ...overrides,
  });

  it('returns null when the student is not enrolled in the course', async () => {
    mockEnrollmentFindFirst.mockResolvedValue(null);
    expect(await getStudentCourse('student-1', 'course-1', now)).toBeNull();
    expect(mockEnrollmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: 'student-1', role: 'STUDENT', courseId: 'course-1' } })
    );
  });

  it('numbers visible lessons in order with the student status, skipping hidden ones', async () => {
    mockEnrollmentFindFirst.mockResolvedValue({
      course: {
        id: 'course-1',
        title: 'Chem',
        description: 'Intro',
        courseLessons: [
          courseLesson('a', { progress: [{ status: 'COMPLETED', attempts: [] }] }),
          courseLesson('hidden', { hideAfterDue: true, dueDate: new Date('2026-10-01T00:00:00Z') }),
          courseLesson('b'),
        ],
      },
    });

    expect(await getStudentCourse('student-1', 'course-1', now)).toEqual({
      id: 'course-1',
      title: 'Chem',
      description: 'Intro',
      lessons: [
        {
          id: 'a',
          number: 1,
          title: 'Title a',
          status: 'COMPLETED',
          nodeCount: 0,
          finishedNodeCount: 0,
          needsAttention: false,
        },
        {
          id: 'b',
          number: 2,
          title: 'Title b',
          status: 'NOT_STARTED',
          nodeCount: 0,
          finishedNodeCount: 0,
          needsAttention: false,
        },
      ],
    });
  });
});

describe('getStudentCourse lesson status from nodes', () => {
  const pass = (lessonNodeId: string) => ({ lessonNodeId, isPassing: true });
  const fail = (lessonNodeId: string) => ({ lessonNodeId, isPassing: false });
  const courseWith = (attempts: { lessonNodeId: string; isPassing: boolean }[]) => ({
    course: {
      id: 'course-1',
      title: 'Chem',
      description: null,
      courseLessons: [
        {
          id: 'a',
          dueDate: null,
          hideAfterDue: false,
          lesson: {
            title: 'Atoms',
            lessonNodes: [
              { id: 'n1', isRequired: true },
              { id: 'n2', isRequired: true },
            ],
          },
          progress: [{ status: 'IN_PROGRESS', attempts }],
        },
      ],
    },
  });
  const statusFor = async (attempts: { lessonNodeId: string; isPassing: boolean }[]) => {
    mockEnrollmentFindFirst.mockResolvedValue(courseWith(attempts));
    return (await getStudentCourse('student-1', 'course-1'))!.lessons[0].status;
  };

  it('counts the lesson as completed once every node is complete or incomplete', async () => {
    expect(await statusFor([pass('n1'), fail('n2'), fail('n2'), fail('n2')])).toBe('COMPLETED');
  });

  it('keeps the stored status while a node is still open', async () => {
    expect(await statusFor([pass('n1'), fail('n2')])).toBe('IN_PROGRESS');
  });

  it('counts each finished node toward the course progress', async () => {
    mockEnrollmentFindFirst.mockResolvedValue(courseWith([pass('n1'), fail('n2')]));
    const course = await getStudentCourse('student-1', 'course-1');
    expect(course!.lessons[0]).toMatchObject({ nodeCount: 2, finishedNodeCount: 1 });
    expect(courseProgressPercent(course!.lessons)).toBe(50);
  });
});

describe('findCurrentLesson', () => {
  const lesson = (id: string, status: StudentLesson['status']): StudentLesson => ({
    id,
    number: 1,
    title: id,
    status,
    nodeCount: 1,
    finishedNodeCount: status === 'COMPLETED' ? 1 : 0,
  });

  it('picks the first lesson that is not completed', () => {
    expect(
      findCurrentLesson([lesson('a', 'COMPLETED'), lesson('b', 'IN_PROGRESS'), lesson('c', 'NOT_STARTED')])?.id
    ).toBe('b');
  });

  it('picks the last lesson when all are completed', () => {
    expect(findCurrentLesson([lesson('a', 'COMPLETED'), lesson('b', 'COMPLETED')])?.id).toBe('b');
  });

  it('returns null when there are no lessons', () => {
    expect(findCurrentLesson([])).toBeNull();
  });
});
