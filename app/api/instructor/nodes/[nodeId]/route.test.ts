import { PATCH } from './route';

const mockAuth = jest.fn();
const mockDeleteMany = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();

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
    mockUpdate.mockResolvedValue({ id: 'node-1', questions: [] });
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        nodeQuestion: { deleteMany: mockDeleteMany },
        node: { update: mockUpdate },
      })
    );
  });

  it('persists valid checkpoint timestamps', async () => {
    const response = await PATCH(
      patchRequest({
        questions: [
          {
            sortOrder: 0,
            prompt: 'Checkpoint',
            options: ['A', 'B'],
            correctIndices: [1],
            isPreLecture: false,
            timeOffsetSeconds: 125,
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { nodeId: 'node-1' } });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          questions: {
            create: [
              expect.objectContaining({
                prompt: 'Checkpoint',
                timeOffsetSeconds: 125,
              }),
            ],
          },
        },
      })
    );
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
  ])('returns 422 for a %s checkpoint timestamp', async (_label, timeOffsetSeconds) => {
    const response = await PATCH(
      patchRequest({
        questions: [
          { sortOrder: 0, prompt: 'Checkpoint', options: ['A', 'B'], correctIndices: [0], timeOffsetSeconds },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('persists missing, null, and duplicate checkpoint timestamps', async () => {
    const response = await PATCH(
      patchRequest({
        questions: [
          { sortOrder: 0, prompt: 'First', options: ['A', 'B'], correctIndices: [0], timeOffsetSeconds: 30 },
          { sortOrder: 1, prompt: 'Second', options: ['A', 'B'], correctIndices: [0], timeOffsetSeconds: 30 },
          {
            sortOrder: 2,
            prompt: 'Third',
            options: ['A', 'B'],
            correctIndices: [0],
            timeOffsetSeconds: null,
          },
          { sortOrder: 3, prompt: 'Fourth', options: ['A', 'B'], correctIndices: [0] },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockUpdate.mock.calls[0][0].data.questions.create).toEqual([
      expect.objectContaining({ prompt: 'First', timeOffsetSeconds: 30 }),
      expect.objectContaining({ prompt: 'Second', timeOffsetSeconds: 30 }),
      expect.objectContaining({ prompt: 'Third', timeOffsetSeconds: null }),
      expect.objectContaining({ prompt: 'Fourth', timeOffsetSeconds: null }),
    ]);
  });

  it('normalizes pre-lecture timestamps to null', async () => {
    const response = await PATCH(
      patchRequest({
        questions: [
          {
            sortOrder: 0,
            prompt: 'Pre-lecture',
            options: ['A', 'B'],
            correctIndices: [0],
            isPreLecture: true,
            timeOffsetSeconds: 99,
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          questions: {
            create: [expect.objectContaining({ isPreLecture: true, timeOffsetSeconds: null })],
          },
        },
      })
    );
  });

  it('updates metadata without replacing questions when questions are omitted', async () => {
    const response = await PATCH(
      patchRequest({ title: '  Updated title  ', summary: '  Updated summary  ' }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          title: 'Updated title',
          summary: 'Updated summary',
        },
      })
    );
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('questions');
  });

  it('persists multiple correct answers', async () => {
    const response = await PATCH(
      patchRequest({
        questions: [
          {
            sortOrder: 0,
            prompt: 'Select all',
            options: { type: 'multipleChoice', choices: ['A', 'B', 'C'] },
            correctIndices: [0, 2],
          },
        ],
      }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockUpdate.mock.calls[0][0].data.questions.create[0].correctIndices).toEqual([0, 2]);
  });
});
