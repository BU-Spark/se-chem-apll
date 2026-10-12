import { POST } from './route';

const mockAuth = jest.fn();
const mockCurrentUser = jest.fn();
const mockUserFindUnique = jest.fn();
const mockLessonNodeFindFirst = jest.fn();
const mockCourseLessonFindFirst = jest.fn();
const mockAttemptCreate = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
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
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    lessonNode: { findFirst: (...args: unknown[]) => mockLessonNodeFindFirst(...args) },
    courseLesson: { findFirst: (...args: unknown[]) => mockCourseLessonFindFirst(...args) },
    nodeAttempt: { create: (...args: unknown[]) => mockAttemptCreate(...args) },
  },
}));

const context = { params: Promise.resolve({ lessonNodeId: 'ln-1' }) };
const DAY = 24 * 60 * 60 * 1000;

function lessonNode(quizQuestionCount: number, bankIds: string[]) {
  return {
    id: 'ln-1',
    lessonId: 'lesson-1',
    quizQuestionCount,
    node: { quizQuestions: bankIds.map((id) => ({ id })) },
  };
}

function courseLesson(overrides: Record<string, unknown> = {}) {
  return { openDate: null, dueDate: null, accessibleAfterDue: false, ...overrides };
}

describe('POST /api/student/quiz/[lessonNodeId]/start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'clerk-1' });
    mockCurrentUser.mockResolvedValue({ emailAddresses: [{ emailAddress: 'Student@BU.edu' }] });
    mockUserFindUnique.mockResolvedValue({ id: 'student-1' });
    mockLessonNodeFindFirst.mockResolvedValue(lessonNode(2, ['q1', 'q2', 'q3']));
    mockCourseLessonFindFirst.mockResolvedValue(courseLesson());
    mockAttemptCreate.mockResolvedValue({ id: 'attempt-1' });
  });

  it('creates an attempt with quizQuestionCount random questions from the bank', async () => {
    const response = await POST({} as never, context);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ attemptId: 'attempt-1' });
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { email: 'student@bu.edu' } });

    const { data } = mockAttemptCreate.mock.calls[0][0];
    expect(data).toMatchObject({ lessonNodeId: 'ln-1', userId: 'student-1' });
    expect(data.quizQuestionIds).toHaveLength(2);
    expect(new Set(data.quizQuestionIds).size).toBe(2);
    data.quizQuestionIds.forEach((id: string) => expect(['q1', 'q2', 'q3']).toContain(id));
  });

  it('serves the whole bank when quizQuestionCount is larger than the bank', async () => {
    mockLessonNodeFindFirst.mockResolvedValue(lessonNode(10, ['q1', 'q2']));
    await POST({} as never, context);
    expect([...mockAttemptCreate.mock.calls[0][0].data.quizQuestionIds].sort()).toEqual(['q1', 'q2']);
  });

  it('returns 401 when signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const response = await POST({} as never, context);
    expect(response.status).toBe(401);
    expect(mockAttemptCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when the student has no database user', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const response = await POST({} as never, context);
    expect(response.status).toBe(404);
  });

  it('returns 404 for a missing or draft lesson node', async () => {
    mockLessonNodeFindFirst.mockResolvedValue(null);
    const response = await POST({} as never, context);
    expect(response.status).toBe(404);
    expect(mockLessonNodeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ln-1', lesson: { isDraft: false }, node: { isDraft: false } },
      })
    );
  });

  it('returns 403 when the student is not enrolled in a course with the lesson', async () => {
    mockCourseLessonFindFirst.mockResolvedValue(null);
    const response = await POST({} as never, context);
    expect(response.status).toBe(403);
    expect(mockCourseLessonFindFirst).toHaveBeenCalledWith({
      where: { lessonId: 'lesson-1', course: { enrollments: { some: { studentId: 'student-1' } } } },
    });
    expect(mockAttemptCreate).not.toHaveBeenCalled();
  });

  it('returns 403 before the open date', async () => {
    mockCourseLessonFindFirst.mockResolvedValue(courseLesson({ openDate: new Date(Date.now() + DAY) }));
    const response = await POST({} as never, context);
    expect(response.status).toBe(403);
  });

  it('returns 403 after the due date without late access', async () => {
    mockCourseLessonFindFirst.mockResolvedValue(courseLesson({ dueDate: new Date(Date.now() - DAY) }));
    const response = await POST({} as never, context);
    expect(response.status).toBe(403);
  });

  it('allows late attempts when the professor enabled access after due', async () => {
    mockCourseLessonFindFirst.mockResolvedValue(
      courseLesson({ dueDate: new Date(Date.now() - DAY), accessibleAfterDue: true })
    );
    const response = await POST({} as never, context);
    expect(response.status).toBe(201);
  });

  it('returns 422 when the node has no quiz questions', async () => {
    mockLessonNodeFindFirst.mockResolvedValue(lessonNode(3, []));
    const response = await POST({} as never, context);
    expect(response.status).toBe(422);
    expect(mockAttemptCreate).not.toHaveBeenCalled();
  });

  it('returns 422 when quizQuestionCount is 0', async () => {
    mockLessonNodeFindFirst.mockResolvedValue(lessonNode(0, ['q1', 'q2']));
    const response = await POST({} as never, context);
    expect(response.status).toBe(422);
    expect(mockAttemptCreate).not.toHaveBeenCalled();
  });
});
