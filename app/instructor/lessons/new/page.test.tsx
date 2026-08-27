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
