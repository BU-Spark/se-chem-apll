import { POST } from './route';

const mockAuth = jest.fn();
const mockCreate = jest.fn();

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
    node: { create: (...args: unknown[]) => mockCreate(...args) },
  },
}));

function postRequest(body: unknown) {
  return { json: async () => body };
}

describe('POST /api/instructor/nodes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockCreate.mockResolvedValue({ id: 'node-1', questions: [] });
  });

  it('persists null, omitted, and duplicate checkpoint timestamps', async () => {
    const response = await POST(
      postRequest({
        title: 'Safety video',
        questions: [
          { sortOrder: 0, prompt: 'First', options: ['A', 'B'], correctIndices: [0], timeOffsetSeconds: 45 },
          { sortOrder: 1, prompt: 'Second', options: ['A', 'B'], correctIndices: [0], timeOffsetSeconds: 45 },
          { sortOrder: 2, prompt: 'Third', options: ['A', 'B'], correctIndices: [0], timeOffsetSeconds: null },
          { sortOrder: 3, prompt: 'Fourth', options: ['A', 'B'], correctIndices: [0] },
        ],
      }) as never
    );

    expect(response.status).toBe(201);
    expect(mockCreate.mock.calls[0][0].data.questions.create).toEqual([
      expect.objectContaining({ prompt: 'First', timeOffsetSeconds: 45 }),
      expect.objectContaining({ prompt: 'Second', timeOffsetSeconds: 45 }),
      expect.objectContaining({ prompt: 'Third', timeOffsetSeconds: null }),
      expect.objectContaining({ prompt: 'Fourth', timeOffsetSeconds: null }),
    ]);
  });

  it.each([-1, 1.5])('returns 422 for invalid checkpoint timestamp %p', async (timeOffsetSeconds) => {
    const response = await POST(
      postRequest({
        title: 'Safety video',
        questions: [
          { sortOrder: 0, prompt: 'Checkpoint', options: ['A', 'B'], correctIndices: [0], timeOffsetSeconds },
        ],
      }) as never
    );

    expect(response.status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('persists multiple correct answers', async () => {
    const response = await POST(
      postRequest({
        title: 'Safety video',
        questions: [
          {
            sortOrder: 0,
            prompt: 'Select all',
            options: { type: 'multipleChoice', choices: ['A', 'B', 'C'] },
            correctIndices: [0, 2],
          },
        ],
      }) as never
    );

    expect(response.status).toBe(201);
    expect(mockCreate.mock.calls[0][0].data.questions.create[0].correctIndices).toEqual([0, 2]);
  });

  it.each([
    ['missing', undefined],
    ['empty', []],
    ['duplicate', [0, 0]],
    ['out of range', [2]],
  ])('returns 422 for %s correct answer selections', async (_label, correctIndices) => {
    const response = await POST(
      postRequest({
        title: 'Safety video',
        questions: [{ sortOrder: 0, prompt: 'Question', options: ['A', 'B'], correctIndices }],
      }) as never
    );

    expect(response.status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['too few', ['A']],
    ['too many', ['1', '2', '3', '4', '5', '6', '7', '8', '9']],
  ])('returns 422 for %s multiple-choice options', async (_label, options) => {
    const response = await POST(
      postRequest({
        title: 'Safety video',
        questions: [{ sortOrder: 0, prompt: 'Question', options, correctIndices: [0] }],
      }) as never
    );

    expect(response.status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('persists explicit short-answer range options', async () => {
    const options = { type: 'shortAnswer', answerMode: 'range', minimumAnswer: -2.5, maximumAnswer: 4 };
    const response = await POST(
      postRequest({
        title: 'Safety video',
        questions: [{ sortOrder: 0, prompt: 'Estimate', options }],
      }) as never
    );

    expect(response.status).toBe(201);
    expect(mockCreate.mock.calls[0][0].data.questions.create[0]).toEqual(
      expect.objectContaining({ options, correctIndices: [] })
    );
  });

  it('returns 422 for a reversed short-answer range', async () => {
    const response = await POST(
      postRequest({
        title: 'Safety video',
        questions: [
          {
            sortOrder: 0,
            prompt: 'Estimate',
            options: { type: 'shortAnswer', answerMode: 'range', minimumAnswer: 10, maximumAnswer: 5 },
          },
        ],
      }) as never
    );

    expect(response.status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
