jest.mock('@/lib/auth/content', () => ({ referencedContentAllowed: async () => true }));
import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import { POST } from './route';

const mockNodeFindFirst = jest.fn();
const mockLessonCreate = jest.fn();
const mockLessonFindUnique = jest.fn();
const mockEdgeCreateMany = jest.fn();


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
    node: { findFirst: (...args: unknown[]) => mockNodeFindFirst(...args) },
    lesson: {
      create: (...args: unknown[]) => mockLessonCreate(...args),
      findUnique: (...args: unknown[]) => mockLessonFindUnique(...args),
    },
    lessonNodeEdge: { createMany: (...args: unknown[]) => mockEdgeCreateMany(...args) },
  },
}));

function postRequest(body: unknown) {
  return { json: async () => body };
}

describe('POST /api/instructor/lessons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'instructor-1' }));
    mockNodeFindFirst.mockResolvedValue(null);
    mockLessonCreate.mockResolvedValue({ id: 'lesson-1', lessonNodes: [] });
    mockLessonFindUnique.mockResolvedValue({ id: 'lesson-1', lessonNodes: [], lessonNodeEdges: [] });
  });

  it('persists an incomplete draft with a nullable slug', async () => {
    const response = await POST(
      postRequest({ title: '', slug: '', summary: '', lessonNodes: [], edges: [], isDraft: true }) as never
    );

    expect(response.status).toBe(201);
    expect(mockLessonCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: '',
          slug: null,
          summary: '',
          isDraft: true,
        }),
      })
    );
  });

  it('rejects the same incomplete content when publishing', async () => {
    const response = await POST(
      postRequest({ title: '', slug: '', summary: '', lessonNodes: [], edges: [], isDraft: false }) as never
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'title is required' });
    expect(mockLessonCreate).not.toHaveBeenCalled();
  });

  it('rejects importing a draft node', async () => {
    mockNodeFindFirst.mockResolvedValue({ id: 'node-draft' });

    const response = await POST(
      postRequest({
        title: 'Lesson',
        slug: 'lesson',
        summary: 'Summary',
        isDraft: false,
        lessonNodes: [
          { nodeId: 'node-draft', sortOrder: 0, passingPercent: 80, quizQuestionCount: 1, isRequired: true },
        ],
      }) as never
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Draft nodes cannot be added to a lesson.' });
    expect(mockNodeFindFirst).toHaveBeenCalledWith({
      where: { id: { in: ['node-draft'] }, isDraft: true },
      select: { id: true },
    });
    expect(mockLessonCreate).not.toHaveBeenCalled();
  });
});
