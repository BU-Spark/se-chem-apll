import EditLessonPage from './page';

const mockAuth = jest.fn();
const mockLessonFindFirst = jest.fn();
const mockNodeFindMany = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    lesson: { findFirst: (...args: unknown[]) => mockLessonFindFirst(...args) },
    node: { findMany: (...args: unknown[]) => mockNodeFindMany(...args) },
  },
}));

describe('EditLessonPage', () => {
  it('only queries published nodes for the import picker', async () => {
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockLessonFindFirst.mockResolvedValue({
      id: 'lesson-1',
      title: 'Lesson',
      slug: 'lesson',
      summary: 'Summary',
      description: null,
      estimatedMinutes: null,
      isDraft: false,
      lessonNodes: [],
      lessonNodeEdges: [],
    });
    mockNodeFindMany.mockResolvedValue([]);

    await EditLessonPage({ params: Promise.resolve({ lessonId: 'lesson-1' }) });

    expect(mockNodeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      })
    );
  });
});
