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
          { sortOrder: 0, prompt: 'First', options: [], timeOffsetSeconds: 45 },
          { sortOrder: 1, prompt: 'Second', options: [], timeOffsetSeconds: 45 },
          { sortOrder: 2, prompt: 'Third', options: [], timeOffsetSeconds: null },
          { sortOrder: 3, prompt: 'Fourth', options: [] },
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
        questions: [{ sortOrder: 0, prompt: 'Checkpoint', options: [], timeOffsetSeconds }],
      }) as never
    );

    expect(response.status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
