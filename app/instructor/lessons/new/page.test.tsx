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
import NewLessonPage from './page';

const mockAuth = jest.fn();
const mockNodeFindMany = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    node: { findMany: (...args: unknown[]) => mockNodeFindMany(...args) },
  },
}));

describe('NewLessonPage', () => {
  it('only queries published nodes for the import picker', async () => {
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockNodeFindMany.mockResolvedValue([]);

    await NewLessonPage();

    expect(mockNodeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      })
    );
  });
});
