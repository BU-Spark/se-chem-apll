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
import { PATCH } from './route';

const mockAuth = jest.fn();
const mockCheckpointFindMany = jest.fn();
const mockQuizFindMany = jest.fn();
const mockResponseDeleteMany = jest.fn();
const mockCheckpointCreate = jest.fn();
const mockCheckpointUpdate = jest.fn();
const mockItemUpdate = jest.fn();
const mockItemCreate = jest.fn();
const mockItemDeleteMany = jest.fn();
const mockResponseCount = jest.fn();
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
    mockCheckpointCreate.mockImplementation(async ({ data }) =>
      data.map((c: { sortOrder: number }) => ({ id: `created-${c.sortOrder}`, sortOrder: c.sortOrder }))
    );
    mockResponseCount.mockResolvedValue(0);
    mockQuizFindMany.mockResolvedValue([]);
    mockUpdate.mockResolvedValue({ id: 'node-1', checkpoints: [], quizQuestions: [] });
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        nodeCheckpoint: {
          findMany: mockCheckpointFindMany,
          createManyAndReturn: mockCheckpointCreate,
          update: mockCheckpointUpdate,
          deleteMany: mockCheckpointDeleteMany,
        },
        quizQuestion: {
          findMany: mockQuizFindMany,
          deleteMany: mockQuizDeleteMany,
        },
        checkpointQuestion: { update: mockItemUpdate, createMany: mockItemCreate, deleteMany: mockItemDeleteMany },
        nodeResponse: { deleteMany: mockResponseDeleteMany, count: mockResponseCount },
        node: { update: mockUpdate },
      })
    );
  });

  it('replaces checkpoints and quiz questions', async () => {
    const response = await PATCH(
      patchRequest({
        tags: ['  Safety  ', ''],
        learningObjectives: ['  Work safely.  ', '', 'Recognize hazards.'],
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
    expect(mockCheckpointDeleteMany).not.toHaveBeenCalled();
    expect(mockQuizDeleteMany).toHaveBeenCalledWith({ where: { nodeId: 'node-1' } });
    expect(mockCheckpointCreate).toHaveBeenCalledWith({
      data: [expect.objectContaining({ nodeId: 'node-1', timeOffsetSeconds: 125 })],
      select: { id: true, sortOrder: true },
    });
    expect(mockItemCreate).toHaveBeenCalledWith({
      data: [expect.objectContaining({ checkpointId: 'created-0', prompt: 'Checkpoint' })],
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tags: ['Safety'],
          learningObjectives: ['Work safely.', 'Recognize hazards.'],
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

  it('replaces checkpoints with informational notes', async () => {
    const response = await PATCH(
      patchRequest({
        checkpoints: [
          {
            sortOrder: 0,
            timeOffsetSeconds: 125,
            questions: [
              {
                sortOrder: 0,
                kind: 'note',
                prompt: 'Pause and observe the safety gauge.',
              },
            ],
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockItemCreate).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          checkpointId: 'created-0',
          kind: 'NOTE',
          prompt: 'Pause and observe the safety gauge.',
          correctIndices: [],
        }),
      ],
    });
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

  it('updates node metadata without checkpoint writes when included checkpoints are unchanged', async () => {
    const checkpoint = {
      id: 'cp-1',
      checkpointKey: 'intro',
      placementHint: null,
      sortOrder: 0,
      timeOffsetSeconds: 30,
      questions: [
        { id: 'cq-1', sortOrder: 0, kind: 'NOTE', prompt: 'Observe.', options: { type: 'note' }, correctIndices: [] },
      ],
    };
    mockCheckpointFindMany.mockResolvedValue([checkpoint]);
    const response = await PATCH(patchRequest({ title: 'Renamed', checkpoints: [checkpoint] }) as never, context);
    expect(response.status).toBe(200);
    expect(mockCheckpointUpdate).not.toHaveBeenCalled();
    expect(mockCheckpointCreate).not.toHaveBeenCalled();
    expect(mockCheckpointDeleteMany).not.toHaveBeenCalled();
    expect(mockItemUpdate).not.toHaveBeenCalled();
    expect(mockItemCreate).not.toHaveBeenCalled();
    expect(mockItemDeleteMany).not.toHaveBeenCalled();
    expect(mockResponseCount).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { title: 'Renamed' } }));
  });

  it('clears learning objectives when given an empty array', async () => {
    const response = await PATCH(patchRequest({ learningObjectives: [] }) as never, context);

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { learningObjectives: [] },
      })
    );
  });

  it.each([
    ['a non-array value', 'not an array'],
    ['a non-string array item', ['valid', 12]],
  ])('returns 422 when learningObjectives contains %s', async (_label, learningObjectives) => {
    const response = await PATCH(patchRequest({ learningObjectives }) as never, context);

    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
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
    expect(mockCheckpointDeleteMany).not.toHaveBeenCalled();
    expect(mockCheckpointCreate).toHaveBeenCalledWith({
      data: [expect.objectContaining({ timeOffsetSeconds: 45 })],
      select: { id: true, sortOrder: true },
    });
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('quizQuestions');
  });

  it('blocks checkpoint replacement when items have student responses', async () => {
    mockCheckpointFindMany.mockResolvedValue([{ id: 'cp-1', questions: [{ id: 'cq-1' }, { id: 'cq-2' }] }]);
    mockQuizFindMany.mockResolvedValue([{ id: 'qq-1' }]);
    mockResponseCount.mockResolvedValue(1);

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

    expect(response.status).toBe(409);
    expect(mockResponseDeleteMany).not.toHaveBeenCalled();
    expect(mockCheckpointDeleteMany).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
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

describe('untimed checkpoint drafts', () => {
  const untimed = {
    checkpointKey: 'intro',
    sortOrder: 0,
    timeOffsetSeconds: null,
    placementHint: 'After intro',
    questions: [{ sortOrder: 0, kind: 'note', prompt: 'Observe.' }],
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockCheckpointFindMany.mockResolvedValue([]);
    mockCheckpointCreate.mockImplementation(async ({ data }) =>
      data.map((c: { sortOrder: number }) => ({ id: `created-${c.sortOrder}`, sortOrder: c.sortOrder }))
    );
    mockQuizFindMany.mockResolvedValue([]);
    mockResponseCount.mockResolvedValue(0);
    mockFindFirst.mockResolvedValue({
      id: 'node-1',
      title: 'Node',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      isDraft: true,
      checkpoints: [untimed],
      quizQuestions: [],
    });
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        nodeCheckpoint: {
          findMany: mockCheckpointFindMany,
          createManyAndReturn: mockCheckpointCreate,
          deleteMany: mockCheckpointDeleteMany,
        },
        checkpointQuestion: { createMany: mockItemCreate },
        node: { update: mockUpdate },
      })
    );
  });
  it('saves a draft with an unplaced checkpoint and metadata', async () => {
    const response = await PATCH(patchRequest({ checkpoints: [untimed], isDraft: true }) as never, context);
    expect(response.status).toBe(200);
    expect(mockCheckpointCreate).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ timeOffsetSeconds: null, checkpointKey: 'intro', placementHint: 'After intro' }),
      ],
      select: { id: true, sortOrder: true },
    });
  });
  it('validates stored checkpoints when publishing with omitted content', async () => {
    const response = await PATCH(patchRequest({ isDraft: false }) as never, context);
    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
  it('rejects malformed draft items before opening a transaction', async () => {
    const response = await PATCH(patchRequest({ checkpoints: [{ ...untimed, questions: [null] }] }) as never, context);
    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
