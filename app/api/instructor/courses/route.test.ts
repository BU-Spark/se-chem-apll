import { POST } from './route';

const mockAuth = jest.fn();
const mockCourseFindFirst = jest.fn();
const mockCourseCreate = jest.fn();
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
      create: (...args: unknown[]) => mockCourseCreate(...args),
    },
    lesson: { findFirst: (...args: unknown[]) => mockLessonFindFirst(...args) },
  },
}));

function postRequest(body: unknown) {
  return { json: async () => body };
}

describe('POST /api/instructor/courses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockCourseFindFirst.mockResolvedValue(null);
    mockLessonFindFirst.mockResolvedValue(null);
    mockCourseCreate.mockResolvedValue({ id: 'course-1' });
  });

  it('rejects importing a draft lesson', async () => {
    mockLessonFindFirst.mockResolvedValue({ id: 'lesson-draft' });

    const response = await POST(
      postRequest({
        code: 'CHEM-101',
        title: 'Chemistry',
        lessons: [{ lessonId: 'lesson-draft', sortOrder: 0 }],
      }) as never
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Draft lessons cannot be added to a course.' });
    expect(mockLessonFindFirst).toHaveBeenCalledWith({
      where: { id: { in: ['lesson-draft'] }, isDraft: true },
      select: { id: true },
    });
    expect(mockCourseCreate).not.toHaveBeenCalled();
  });
});
