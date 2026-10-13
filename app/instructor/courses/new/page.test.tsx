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
import NewCoursePage from './page';

const mockAuth = jest.fn();
const mockLessonFindMany = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    lesson: { findMany: (...args: unknown[]) => mockLessonFindMany(...args) },
  },
}));

describe('NewCoursePage', () => {
  it('only queries published lessons for the import picker', async () => {
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockLessonFindMany.mockResolvedValue([]);

    await NewCoursePage();

    expect(mockLessonFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      })
    );
  });
});
