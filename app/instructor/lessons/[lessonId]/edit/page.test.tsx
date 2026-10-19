import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import EditLessonPage from './page';

const mockLessonFindFirst = jest.fn();
const mockNodeFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    lesson: { findFirst: (...args: unknown[]) => mockLessonFindFirst(...args) },
    node: { findMany: (...args: unknown[]) => mockNodeFindMany(...args) },
  },
}));

describe('EditLessonPage', () => {
  it('only queries published nodes for the import picker', async () => {
    mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'instructor-1' }));
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
