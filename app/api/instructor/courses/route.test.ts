jest.mock('@/lib/auth/content', () => ({ referencedContentAllowed: async () => true }));
// These content tests stub identity; auth and provisioning have dedicated tests.
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: async () => {
    const clerk = jest.requireMock('@clerk/nextjs/server');
    const session = await clerk.auth();
    if (!session?.userId) return null;
    const profile = clerk.currentUser ? await clerk.currentUser() : null;
    return {
      id: 'local-user',
      clerkUserId: session.userId,
      email: 'instructor@example.com',
      name: null,
      appRole: clerk.currentUser ? (profile?.unsafeMetadata?.role?.toUpperCase() ?? null) : 'INSTRUCTOR',
      platformRole: 'MEMBER',
    };
  },
}));
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
  it.each([
    { lateDeadline: '2026-10-14T12:00:00Z', hideAfterDue: true },
    { lateDeadline: '2026-10-11T12:00:00Z' },
    { latePenaltyPercent: 101 },
    { latePenaltyType: 'HOURLY', lateDeadline: null },
    { dueDate: 'not-a-date' },
  ])('rejects invalid policy before writing: %j', async (patch) => {
    const response = await POST(
      postRequest({
        code: 'TEST101',
        title: 'Test',
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
      }) as never
    );
    expect(response.status).toBe(422);
    expect(mockCourseCreate).not.toHaveBeenCalled();
  });

  it('persists the daily rate, visibility, and exact deadlines', async () => {
    const response = await POST(
      postRequest({
        code: 'TEST101',
        title: 'Test',
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
      }) as never
    );
    expect(response.status).toBe(201);
    expect(mockCourseCreate).toHaveBeenCalledWith(
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
