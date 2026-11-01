import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import NewCoursePage from './page';

const mockLessonFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    lesson: { findMany: (...args: unknown[]) => mockLessonFindMany(...args) },
  },
}));

describe('NewCoursePage', () => {
  it('only queries published lessons for the import picker', async () => {
    mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'instructor-1' }));
    mockLessonFindMany.mockResolvedValue([]);

    await NewCoursePage();

    expect(mockLessonFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      })
    );
  });
});
