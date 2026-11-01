import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import NewLessonPage from './page';

const mockNodeFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    node: { findMany: (...args: unknown[]) => mockNodeFindMany(...args) },
  },
}));

describe('NewLessonPage', () => {
  it('only queries published nodes for the import picker', async () => {
    mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'instructor-1' }));
    mockNodeFindMany.mockResolvedValue([]);

    await NewLessonPage();

    expect(mockNodeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      })
    );
  });
});
