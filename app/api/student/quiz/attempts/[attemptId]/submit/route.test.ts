import { POST } from './route';

const mockGetCurrentStudent = jest.fn();
const mockAttemptFindFirst = jest.fn();
const mockAttemptUpdateMany = jest.fn();
const mockQuestionFindMany = jest.fn();
const mockResponseCreateMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@/lib/currentStudent', () => ({
  getCurrentStudent: () => mockGetCurrentStudent(),
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
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    nodeAttempt: {
      findFirst: (...args: unknown[]) => mockAttemptFindFirst(...args),
    },
    quizQuestion: { findMany: (...args: unknown[]) => mockQuestionFindMany(...args) },
  },
}));

const context = { params: Promise.resolve({ attemptId: 'attempt-1' }) };

function request(body: unknown) {
  return { json: async () => body } as never;
}

const questions = [
  { id: 'q1', options: { type: 'multipleChoice', choices: ['A', 'B'] }, correctIndices: [1] },
  { id: 'q2', options: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 42 }, correctIndices: [] },
];

function openAttempt(passingPercent = 50) {
  return {
    id: 'attempt-1',
    completedAt: null,
    quizQuestionIds: ['q2', 'q1'],
    lessonNode: { passingPercent },
  };
}

describe('POST /api/student/quiz/attempts/[attemptId]/submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentStudent.mockResolvedValue({ id: 'student-1' });
    mockAttemptFindFirst.mockResolvedValue(openAttempt());
    mockQuestionFindMany.mockResolvedValue(questions);
    mockAttemptUpdateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        nodeAttempt: { updateMany: mockAttemptUpdateMany },
        nodeResponse: { createMany: mockResponseCreateMany },
      })
    );
  });

  it('grades the attempt and saves responses plus the result together', async () => {
    const response = await POST(
      request({
        answers: [
          { questionId: 'q1', selectedIndices: [1] },
          { questionId: 'q2', rawAnswer: '41' },
        ],
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ score: 50, isPassing: true });
    expect(mockAttemptFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1', userId: 'student-1', quizQuestionIds: { isEmpty: false } },
      })
    );
    expect(mockResponseCreateMany).toHaveBeenCalledWith({
      data: [
        {
          attemptId: 'attempt-1',
          quizQuestionId: 'q2',
          studentId: 'student-1',
          selectedIndices: [],
          rawAnswer: '41',
          isCorrect: false,
        },
        {
          attemptId: 'attempt-1',
          quizQuestionId: 'q1',
          studentId: 'student-1',
          selectedIndices: [1],
          rawAnswer: null,
          isCorrect: true,
        },
      ],
    });
    expect(mockAttemptUpdateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', completedAt: null },
      data: { completedAt: expect.any(Date), score: 50, isPassing: true },
    });
  });

  it('saves nothing when a simultaneous submit already won', async () => {
    mockAttemptUpdateMany.mockResolvedValue({ count: 0 });
    const response = await POST(
      request({
        answers: [
          { questionId: 'q1', selectedIndices: [1] },
          { questionId: 'q2', rawAnswer: '42' },
        ],
      }),
      context
    );

    expect(response.status).toBe(409);
    expect(mockResponseCreateMany).not.toHaveBeenCalled();
  });

  it('fails the attempt below passingPercent', async () => {
    mockAttemptFindFirst.mockResolvedValue(openAttempt(80));
    const response = await POST(
      request({
        answers: [
          { questionId: 'q1', selectedIndices: [1] },
          { questionId: 'q2', rawAnswer: '0' },
        ],
      }),
      context
    );
    expect(await response.json()).toMatchObject({ score: 50, isPassing: false });
  });

  it('returns 401 when there is no signed-in student', async () => {
    mockGetCurrentStudent.mockResolvedValue(null);
    const response = await POST(request({ answers: [] }), context);
    expect(response.status).toBe(401);
  });

  it("returns 404 for another student's or a missing attempt", async () => {
    mockAttemptFindFirst.mockResolvedValue(null);
    const response = await POST(request({ answers: [] }), context);
    expect(response.status).toBe(404);
  });

  it('returns 409 when the attempt was already submitted', async () => {
    mockAttemptFindFirst.mockResolvedValue({ ...openAttempt(), completedAt: new Date() });
    const response = await POST(request({ answers: [] }), context);
    expect(response.status).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns 409 when a picked question was removed by the instructor', async () => {
    mockQuestionFindMany.mockResolvedValue([questions[0]]);
    const response = await POST(request({ answers: [] }), context);
    expect(response.status).toBe(409);
  });

  it('returns 422 when a short answer is not a number', async () => {
    const response = await POST(
      request({
        answers: [
          { questionId: 'q1', selectedIndices: [1] },
          { questionId: 'q2', rawAnswer: 'forty-two' },
        ],
      }),
      context
    );
    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 without an answers array', async () => {
    const response = await POST(request({}), context);
    expect(response.status).toBe(400);
  });
});
