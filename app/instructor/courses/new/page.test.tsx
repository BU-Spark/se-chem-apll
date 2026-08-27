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
