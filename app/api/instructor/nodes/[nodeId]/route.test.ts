import { PATCH } from './route';

const mockAuth = jest.fn();
const mockCheckpointFindMany = jest.fn();
const mockQuizFindMany = jest.fn();
const mockResponseDeleteMany = jest.fn();
const mockCheckpointDeleteMany = jest.fn();
const mockQuizDeleteMany = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();
const mockFindFirst = jest.fn();

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
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    node: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

const context = { params: Promise.resolve({ nodeId: 'node-1' }) };

function patchRequest(body: unknown) {
  return { json: async () => body };
}

describe('PATCH /api/instructor/nodes/[nodeId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockFindFirst.mockResolvedValue({
      id: 'node-1',
      title: 'Existing node',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      isDraft: false,
      checkpoints: [],
      quizQuestions: [
        {
          sortOrder: 0,
          prompt: 'Existing quiz',
          options: { type: 'multipleChoice', choices: ['A', 'B'] },
          correctIndices: [0],
        },
      ],
    });
    mockCheckpointFindMany.mockResolvedValue([]);
    mockQuizFindMany.mockResolvedValue([]);
    mockUpdate.mockResolvedValue({ id: 'node-1', checkpoints: [], quizQuestions: [] });
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        nodeCheckpoint: {
          findMany: mockCheckpointFindMany,
          deleteMany: mockCheckpointDeleteMany,
        },
        quizQuestion: {
          findMany: mockQuizFindMany,
          deleteMany: mockQuizDeleteMany,
        },
        nodeResponse: { deleteMany: mockResponseDeleteMany },
        node: { update: mockUpdate },
      })
    );
  });

  it('replaces checkpoints and quiz questions', async () => {
    const response = await PATCH(
      patchRequest({
        learningObjectives: ['  Trim me  ', ''],
        checkpoints: [
          {
            sortOrder: 0,
            timeOffsetSeconds: 125,
            questions: [
              {
                sortOrder: 0,
                prompt: 'Checkpoint',
                options: ['A', 'B'],
                correctIndices: [1],
              },
            ],
          },
        ],
        quizQuestions: [
          {
            sortOrder: 0,
            prompt: 'Quiz',
            options: { type: 'multipleChoice', choices: ['A', 'B', 'C'] },
            correctIndices: [0, 2],
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockCheckpointDeleteMany).toHaveBeenCalledWith({ where: { nodeId: 'node-1' } });
    expect(mockQuizDeleteMany).toHaveBeenCalledWith({ where: { nodeId: 'node-1' } });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          learningObjectives: ['Trim me'],
          checkpoints: {
            create: [
              expect.objectContaining({
                timeOffsetSeconds: 125,
                questions: {
                  create: [expect.objectContaining({ prompt: 'Checkpoint' })],
                },
              }),
            ],
          },
          quizQuestions: {
            create: [expect.objectContaining({ prompt: 'Quiz', correctIndices: [0, 2] })],
          },
        }),
      })
    );
  });

  it('allows incomplete content when saving as a draft', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'node-1',
      title: '',
      videoUrl: null,
      isDraft: true,
      checkpoints: [],
      quizQuestions: [],
    });

    const response = await PATCH(
      patchRequest({ title: '', videoUrl: null, checkpoints: [], quizQuestions: [], isDraft: true }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockUpdate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ title: '', videoUrl: null, isDraft: true })
    );
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
  ])('returns 422 for a %s checkpoint timestamp', async (_label, timeOffsetSeconds) => {
    const response = await PATCH(
      patchRequest({
        checkpoints: [
          {
            sortOrder: 0,
            timeOffsetSeconds,
            questions: [{ sortOrder: 0, prompt: 'Checkpoint', options: ['A', 'B'], correctIndices: [0] }],
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns 422 for duplicate checkpoint timestamps', async () => {
    const response = await PATCH(
      patchRequest({
        checkpoints: [
          {
            sortOrder: 0,
            timeOffsetSeconds: 30,
            questions: [{ sortOrder: 0, prompt: 'First', options: ['A', 'B'], correctIndices: [0] }],
          },
          {
            sortOrder: 1,
            timeOffsetSeconds: 30,
            questions: [{ sortOrder: 0, prompt: 'Second', options: ['A', 'B'], correctIndices: [0] }],
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('updates metadata without replacing content when content is omitted', async () => {
    const response = await PATCH(
      patchRequest({ title: '  Updated title  ', summary: '  Updated summary  ' }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockCheckpointDeleteMany).not.toHaveBeenCalled();
    expect(mockQuizDeleteMany).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          title: 'Updated title',
          summary: 'Updated summary',
        },
      })
    );
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('checkpoints');
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('quizQuestions');
  });

  it('replaces only quiz questions when checkpoints are omitted', async () => {
    const response = await PATCH(
      patchRequest({
        quizQuestions: [
          {
            sortOrder: 0,
            prompt: 'Quiz only',
            options: { type: 'multipleChoice', choices: ['A', 'B'] },
            correctIndices: [0],
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockCheckpointDeleteMany).not.toHaveBeenCalled();
    expect(mockCheckpointFindMany).not.toHaveBeenCalled();
    expect(mockQuizDeleteMany).toHaveBeenCalledWith({ where: { nodeId: 'node-1' } });
    expect(mockUpdate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        quizQuestions: {
          create: [expect.objectContaining({ prompt: 'Quiz only' })],
        },
      })
    );
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('checkpoints');
  });

  it('replaces only checkpoints when quiz questions are omitted', async () => {
    const response = await PATCH(
      patchRequest({
        checkpoints: [
          {
            sortOrder: 0,
            timeOffsetSeconds: 45,
            questions: [
              {
                sortOrder: 0,
                prompt: 'Checkpoint only',
                options: { type: 'multipleChoice', choices: ['A', 'B'] },
                correctIndices: [1],
              },
            ],
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockQuizDeleteMany).not.toHaveBeenCalled();
    expect(mockQuizFindMany).not.toHaveBeenCalled();
    expect(mockCheckpointDeleteMany).toHaveBeenCalledWith({ where: { nodeId: 'node-1' } });
    expect(mockUpdate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        checkpoints: {
          create: [
            expect.objectContaining({
              timeOffsetSeconds: 45,
              questions: {
                create: [expect.objectContaining({ prompt: 'Checkpoint only' })],
              },
            }),
          ],
        },
      })
    );
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('quizQuestions');
  });

  it('deletes related responses before replacing each collection', async () => {
    mockCheckpointFindMany.mockResolvedValue([{ id: 'cp-1', questions: [{ id: 'cq-1' }, { id: 'cq-2' }] }]);
    mockQuizFindMany.mockResolvedValue([{ id: 'qq-1' }]);

    const response = await PATCH(
      patchRequest({
        checkpoints: [
          {
            sortOrder: 0,
            timeOffsetSeconds: 10,
            questions: [
              {
                sortOrder: 0,
                prompt: 'New checkpoint',
                options: { type: 'multipleChoice', choices: ['A', 'B'] },
                correctIndices: [0],
              },
            ],
          },
        ],
        quizQuestions: [
          {
            sortOrder: 0,
            prompt: 'New quiz',
            options: { type: 'multipleChoice', choices: ['A', 'B'] },
            correctIndices: [1],
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockResponseDeleteMany).toHaveBeenCalledWith({
      where: { checkpointQuestionId: { in: ['cq-1', 'cq-2'] } },
    });
    expect(mockResponseDeleteMany).toHaveBeenCalledWith({
      where: { quizQuestionId: { in: ['qq-1'] } },
    });
  });

  it('returns 422 when video URL is empty or invalid', async () => {
    const response = await PATCH(patchRequest({ videoUrl: '' }) as never, context);
    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
  it('returns 422 when quiz questions are replaced with an empty list', async () => {
    const response = await PATCH(patchRequest({ quizQuestions: [] }) as never, context);
    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
