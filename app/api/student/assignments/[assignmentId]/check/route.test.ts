import { POST } from './route';

const mockApiAccess = jest.fn();
const mockAttemptFindFirst = jest.fn();

jest.mock('@/lib/auth/api', () => ({ apiAccess: () => mockApiAccess() }));
// Every way to write an attempt or an answer is a mock too, so a test can prove none is used.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    nodeAttempt: {
      findFirst: (...args: unknown[]) => mockAttemptFindFirst(...args),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    nodeResponse: { create: jest.fn(), createMany: jest.fn() },
  },
}));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}));

const context = { params: Promise.resolve({ assignmentId: 'cl-1' }) };
const request = (body: unknown) => ({ json: async () => body }) as never;
const check = async (answer: unknown) => POST(request({ attemptId: 'a1', answer }), context);
const snapshot = {
  questions: [
    { id: 'q1', prompt: 'Pick B', options: ['A', 'B'], correctIndices: [1] },
    { id: 'both', prompt: 'Pick A and C', options: ['A', 'B', 'C'], correctIndices: [0, 2] },
    {
      id: 'num',
      prompt: 'Type 7',
      options: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 7 },
      correctIndices: [],
    },
  ],
};

describe('POST /api/student/assignments/[assignmentId]/check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiAccess.mockResolvedValue({ user: { id: 'student-1' } });
    mockAttemptFindFirst.mockResolvedValue({ snapshot });
  });

  it("checks one answer of the student's own unfinished video attempt", async () => {
    expect(await (await check({ questionId: 'q1', selectedIndices: [1] })).json()).toEqual({ correct: true });
    expect(await (await check({ questionId: 'q1', selectedIndices: [0] })).json()).toEqual({ correct: false });

    expect(mockAttemptFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'a1',
        userId: 'student-1',
        courseLessonId: 'cl-1',
        kind: 'CHECKPOINT',
        completedAt: null,
        progress: {
          courseLesson: {
            lesson: { isDraft: false },
            course: { enrollments: { some: { studentId: 'student-1', role: 'STUDENT' } } },
          },
        },
      },
      select: { snapshot: true },
    });
  });

  it('checks multiple-answer, number, and "I\'m Not Sure" answers', async () => {
    expect(await (await check({ questionId: 'both', selectedIndices: [2, 0] })).json()).toEqual({ correct: true });
    expect(await (await check({ questionId: 'both', selectedIndices: [0] })).json()).toEqual({ correct: false });
    expect(await (await check({ questionId: 'num', rawAnswer: '7' })).json()).toEqual({ correct: true });
    expect(await (await check({ questionId: 'num', rawAnswer: '8' })).json()).toEqual({ correct: false });
    expect(await (await check({ questionId: 'q1', notSure: true })).json()).toEqual({ correct: false });
  });

  it('never writes to the database', async () => {
    await check({ questionId: 'q1', selectedIndices: [1] });
    const { prisma } = jest.requireMock('@/lib/prisma');
    const writes = [
      ...Object.entries(prisma.nodeAttempt).filter(([name]) => name !== 'findFirst'),
      ...Object.entries(prisma.nodeResponse),
    ];
    for (const [, write] of writes) expect(write).not.toHaveBeenCalled();
  });

  it('returns the access error when signed out or not a student', async () => {
    mockApiAccess.mockResolvedValue({ error: { status: 401 } });
    expect((await check({ questionId: 'q1', selectedIndices: [1] })).status).toBe(401);
    mockApiAccess.mockResolvedValue({ error: { status: 403 } });
    expect((await check({ questionId: 'q1', selectedIndices: [1] })).status).toBe(403);
    expect(mockAttemptFindFirst).not.toHaveBeenCalled();
  });

  it('returns 404 for an attempt that is not theirs, finished, unknown, or no longer enrolled', async () => {
    mockAttemptFindFirst.mockResolvedValue(null);
    expect((await check({ questionId: 'q1', selectedIndices: [1] })).status).toBe(404);
  });

  it('returns 404 for a question that is not in the attempt', async () => {
    const response = await check({ questionId: 'not-in-attempt', selectedIndices: [1] });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Question not found.' });
  });

  it('returns 400 for a body that is not JSON', async () => {
    const notJson = { json: async () => Promise.reject(new SyntaxError('Unexpected token')) } as never;
    expect((await POST(notJson, context)).status).toBe(400);
  });

  it.each([
    ['no attemptId', { answer: { questionId: 'q1', selectedIndices: [1] } }],
    ['a number attemptId', { attemptId: 1, answer: { questionId: 'q1', selectedIndices: [1] } }],
    ['no answer', { attemptId: 'a1' }],
    ['an answer that is text', { attemptId: 'a1', answer: 'B' }],
    ['no questionId', { attemptId: 'a1', answer: { selectedIndices: [1] } }],
    ['choices that are not a list', { attemptId: 'a1', answer: { questionId: 'q1', selectedIndices: 1 } }],
    [
      'too many choices',
      { attemptId: 'a1', answer: { questionId: 'q1', selectedIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8] } },
    ],
    ['a number answer that is not text', { attemptId: 'a1', answer: { questionId: 'num', rawAnswer: 7 } }],
    ['a very long answer', { attemptId: 'a1', answer: { questionId: 'num', rawAnswer: '7'.repeat(101) } }],
    ['notSure that is not true/false', { attemptId: 'a1', answer: { questionId: 'q1', notSure: 'yes' } }],
  ])('returns 400 for %s, before looking up the attempt', async (_, body) => {
    expect((await POST(request(body), context)).status).toBe(400);
    expect(mockAttemptFindFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when grading rejects the answer, like the finish action', async () => {
    expect((await check({ questionId: 'q1', selectedIndices: [9] })).status).toBe(400);
    expect((await check({ questionId: 'q1', selectedIndices: [] })).status).toBe(400);
    expect((await check({ questionId: 'num', rawAnswer: 'abc' })).status).toBe(400);
  });

  it('lets a database error through as a server error', async () => {
    mockAttemptFindFirst.mockRejectedValue(new Error('database unavailable'));
    await expect(check({ questionId: 'q1', selectedIndices: [1] })).rejects.toThrow('database unavailable');
  });
});
