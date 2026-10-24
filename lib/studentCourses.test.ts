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

jest.mock('@/lib/prisma', () => ({
  prisma: {
    enrollment: {
      findMany: (...args: unknown[]) => mockEnrollmentFindMany(...args),
      findFirst: (...args: unknown[]) => mockEnrollmentFindFirst(...args),
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
              lesson: { title: 'A' },
              progress: [{ status: 'COMPLETED' }],
            },
            { id: 'b', dueDate: null, hideAfterDue: false, lesson: { title: 'B' }, progress: [] },
            {
              id: 'hidden',
              dueDate: new Date('2026-01-01T00:00:00Z'),
              hideAfterDue: true,
              lesson: { title: 'Hidden' },
              progress: [{ status: 'COMPLETED' }],
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
  const lesson = (status: 'COMPLETED' | 'NOT_STARTED' | 'IN_PROGRESS') => ({
    id: status,
    number: 1,
    title: '',
    status,
  });

  it('is completed lessons out of all lessons, rounded', () => {
    expect(courseProgressPercent([lesson('COMPLETED'), lesson('IN_PROGRESS'), lesson('NOT_STARTED')])).toBe(33);
    expect(courseProgressPercent([lesson('COMPLETED'), lesson('COMPLETED')])).toBe(100);
  });

  it('is 0 for a course with no lessons', () => {
    expect(courseProgressPercent([])).toBe(0);
  });
});

describe('getStudentInstructors', () => {
  it("lists instructors of the student's courses once each", async () => {
    mockContactFindMany.mockResolvedValue([
      { id: 'a', name: 'Jane Smith', email: 'janesmith@bu.edu' },
      { id: 'b', name: 'Jane Smith', email: 'janesmith@bu.edu' },
      { id: 'c', name: 'Ali Khan', email: 'alikhan@bu.edu' },
    ]);

    expect((await getStudentInstructors('student-1')).map((instructor) => instructor.id)).toEqual(['a', 'c']);
    expect(mockContactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: 'INSTRUCTOR',
          course: { enrollments: { some: { studentId: 'student-1', role: 'STUDENT' } } },
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
    lesson: { title: `Title ${id}` },
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
          courseLesson('a', { progress: [{ status: 'COMPLETED' }] }),
          courseLesson('hidden', { hideAfterDue: true, dueDate: new Date('2026-10-01T00:00:00Z') }),
          courseLesson('b', { dueDate: new Date('2026-10-01T00:00:00Z'), hideAfterDue: false }),
        ],
      },
    });

    expect(await getStudentCourse('student-1', 'course-1', now)).toEqual({
      id: 'course-1',
      title: 'Chem',
      description: 'Intro',
      lessons: [
        { id: 'a', number: 1, title: 'Title a', status: 'COMPLETED' },
        { id: 'b', number: 2, title: 'Title b', status: 'NOT_STARTED' },
      ],
    });
  });
});

describe('findCurrentLesson', () => {
  const lesson = (id: string, status: StudentLesson['status']): StudentLesson => ({ id, number: 1, title: id, status });

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
