import { PATCH } from './route';

const mockAuth = jest.fn();
const mockLessonFindFirst = jest.fn();
const mockNodeFindFirst = jest.fn();
const mockLessonUpdate = jest.fn();
const mockLessonFindUnique = jest.fn();
const mockEdgeCreateMany = jest.fn();

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
    lesson: {
      findFirst: (...args: unknown[]) => mockLessonFindFirst(...args),
      update: (...args: unknown[]) => mockLessonUpdate(...args),
      findUnique: (...args: unknown[]) => mockLessonFindUnique(...args),
    },
    node: { findFirst: (...args: unknown[]) => mockNodeFindFirst(...args) },
    lessonNodeEdge: { createMany: (...args: unknown[]) => mockEdgeCreateMany(...args) },
  },
}));

const context = { params: Promise.resolve({ lessonId: 'lesson-1' }) };

function patchRequest(body: unknown) {
  return { json: async () => body };
}

describe('PATCH /api/instructor/lessons/[lessonId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockLessonFindFirst.mockResolvedValue({
      id: 'lesson-1',
      title: 'Existing lesson',
      slug: 'existing-lesson',
      summary: 'Existing summary',
      isDraft: false,
      lessonNodes: [],
    });
    mockNodeFindFirst.mockResolvedValue(null);
    mockLessonUpdate.mockResolvedValue({ id: 'lesson-1', lessonNodes: [] });
    mockLessonFindUnique.mockResolvedValue({ id: 'lesson-1', lessonNodes: [], lessonNodeEdges: [] });
  });

  it('allows incomplete lesson content when saving as a draft', async () => {
    const response = await PATCH(
      patchRequest({ title: '', slug: '', summary: '', lessonNodes: [], edges: [], isDraft: true }) as never,
      context
    );

    expect(response.status).toBe(200);
    expect(mockLessonUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: '', slug: null, summary: '', isDraft: true }),
      })
    );
  });

  it('rejects publishing an incomplete draft', async () => {
    mockLessonFindFirst.mockResolvedValue({
      id: 'lesson-1',
      title: '',
      slug: null,
      summary: '',
      isDraft: true,
      lessonNodes: [],
    });

    const response = await PATCH(patchRequest({ isDraft: false }) as never, context);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'title is required' });
    expect(mockLessonUpdate).not.toHaveBeenCalled();
  });

  it('rejects a draft node before updating lesson relationships', async () => {
    mockNodeFindFirst.mockResolvedValue({ id: 'draft-node' });

    const response = await PATCH(
      patchRequest({
        title: 'Lesson',
        slug: 'lesson',
        summary: 'Summary',
        isDraft: false,
        lessonNodes: [
          { nodeId: 'draft-node', sortOrder: 0, passingPercent: 80, quizQuestionCount: 1, isRequired: true },
        ],
        edges: [],
      }) as never,
      context
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Draft nodes cannot be added to a lesson.' });
    expect(mockLessonUpdate).not.toHaveBeenCalled();
  });
});
