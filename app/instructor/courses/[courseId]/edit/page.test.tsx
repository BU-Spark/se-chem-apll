import EditCoursePage from './page';

const mockAuth = jest.fn();
const mockCourseFindFirst = jest.fn();
const mockLessonFindMany = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    course: { findFirst: (...args: unknown[]) => mockCourseFindFirst(...args) },
    lesson: { findMany: (...args: unknown[]) => mockLessonFindMany(...args) },
  },
}));

describe('EditCoursePage', () => {
  it('only queries published lessons for the import picker', async () => {
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockCourseFindFirst.mockResolvedValue({
      id: 'course-1',
      code: 'CHEM-101',
      section: null,
      title: 'Chemistry',
      description: null,
      courseLessons: [],
      enrollments: [],
      contacts: [],
    });
    mockLessonFindMany.mockResolvedValue([]);

    await EditCoursePage({ params: Promise.resolve({ courseId: 'course-1' }) });

    expect(mockLessonFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      })
    );
  });
});
