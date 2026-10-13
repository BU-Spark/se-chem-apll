import { PATCH } from './route';

const mockAuth = jest.fn();
const mockCourseFindFirst = jest.fn();
const mockCourseUpdate = jest.fn();
const mockLessonFindFirst = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    course: {
      findFirst: (...args: unknown[]) => mockCourseFindFirst(...args),
      update: (...args: unknown[]) => mockCourseUpdate(...args),
    },
    lesson: { findFirst: (...args: unknown[]) => mockLessonFindFirst(...args) },
  },
}));

const context = { params: Promise.resolve({ courseId: 'course-1' }) };

function patchRequest(body: unknown) {
  return { json: async () => body };
}

describe('PATCH /api/instructor/courses/[courseId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockCourseFindFirst.mockResolvedValue({ id: 'course-1' });
    mockLessonFindFirst.mockResolvedValue(null);
    mockCourseUpdate.mockResolvedValue({ id: 'course-1' });
  });

  it('rejects a draft lesson before updating course relationships', async () => {
    mockLessonFindFirst.mockResolvedValue({ id: 'draft-lesson' });

    const response = await PATCH(
      patchRequest({ lessons: [{ lessonId: 'draft-lesson', sortOrder: 0 }] }) as never,
      context
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Draft lessons cannot be added to a course.' });
    expect(mockLessonFindFirst).toHaveBeenCalledWith({
      where: { id: { in: ['draft-lesson'] }, isDraft: true },
      select: { id: true },
    });
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });
  it.each([
    { lateDeadline: '2026-10-14T12:00:00Z', hideAfterDue: true },
    { lateDeadline: '2026-10-11T12:00:00Z' },
    { latePenaltyPercent: 101 },
    { latePenaltyType: 'HOURLY', lateDeadline: null },
    { dueDate: 'not-a-date' },
  ])('rejects invalid policy before writing: %j', async (patch) => {
    const response = await PATCH(
      patchRequest({
        lessons: [
          {
            lessonId: 'lesson-1',
            sortOrder: 0,
            dueDate: '2026-10-12T12:00:00Z',
            lateDeadline: '2026-10-14T12:00:00Z',
            hideAfterDue: false,
            latePenaltyType: 'HOURLY',
            latePenaltyPercent: 1,
            ...patch,
          },
        ],
      }) as never,
      context
    );
    expect(response.status).toBe(422);
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it('persists the daily rate, visibility, and exact deadlines', async () => {
    const response = await PATCH(
      patchRequest({
        lessons: [
          {
            lessonId: 'lesson-1',
            sortOrder: 0,
            dueDate: '2026-10-12T12:00:00Z',
            lateDeadline: '2026-10-14T12:00:00Z',
            hideAfterDue: false,
            latePenaltyType: 'DAILY',
            latePenaltyPercent: 10,
          },
        ],
      }) as never,
      context
    );
    expect(response.status).toBe(200);
    expect(mockCourseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseLessons: expect.objectContaining({
            create: [
              expect.objectContaining({
                dueDate: new Date('2026-10-12T12:00:00Z'),
                lateDeadline: new Date('2026-10-14T12:00:00Z'),
                hideAfterDue: false,
                latePenaltyType: 'DAILY',
                latePenaltyPercent: 10,
              }),
            ],
          }),
        }),
      })
    );
  });
});
