import { POST } from './route';

const mockApiAccess = jest.fn();
const mockAttemptFindFirst = jest.fn();

jest.mock('@/lib/auth/api', () => ({ apiAccess: () => mockApiAccess() }));
jest.mock('@/lib/prisma', () => ({
  prisma: { nodeAttempt: { findFirst: (...args: unknown[]) => mockAttemptFindFirst(...args) } },
}));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}));

const context = { params: Promise.resolve({ assignmentId: 'cl-1' }) };
const request = (body: unknown) => ({ json: async () => body }) as never;
const snapshot = {
  questions: [{ id: 'q1', prompt: 'Pick B', options: ['A', 'B'], correctIndices: [1] }],
};

describe('POST /api/student/assignments/[assignmentId]/check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiAccess.mockResolvedValue({ user: { id: 'student-1' } });
    mockAttemptFindFirst.mockResolvedValue({ snapshot });
  });

  it("checks one answer of the student's unfinished video attempt without saving", async () => {
    const right = await POST(request({ attemptId: 'a1', answer: { questionId: 'q1', selectedIndices: [1] } }), context);
    expect(await right.json()).toEqual({ correct: true });
    const wrong = await POST(request({ attemptId: 'a1', answer: { questionId: 'q1', selectedIndices: [0] } }), context);
    expect(await wrong.json()).toEqual({ correct: false });

    expect(mockAttemptFindFirst).toHaveBeenCalledWith({
      where: { id: 'a1', userId: 'student-1', courseLessonId: 'cl-1', kind: 'CHECKPOINT', completedAt: null },
      select: { snapshot: true },
    });
  });

  it('returns the access error when the user is not a student', async () => {
    mockApiAccess.mockResolvedValue({ error: { status: 403 } });
    expect((await POST(request({}), context)).status).toBe(403);
  });

  it('returns 404 for an attempt that is not theirs, finished, or unknown', async () => {
    mockAttemptFindFirst.mockResolvedValue(null);
    const response = await POST(
      request({ attemptId: 'x', answer: { questionId: 'q1', selectedIndices: [1] } }),
      context
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 for a missing or invalid answer', async () => {
    expect((await POST(request({ attemptId: 'a1' }), context)).status).toBe(400);
    const invalid = await POST(
      request({ attemptId: 'a1', answer: { questionId: 'q1', selectedIndices: [9] } }),
      context
    );
    expect(invalid.status).toBe(400);
  });
});
