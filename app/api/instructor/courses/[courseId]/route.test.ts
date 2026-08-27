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
});
