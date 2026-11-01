import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import EditCoursePage from './page';

const mockCourseFindFirst = jest.fn();
const mockLessonFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    course: { findFirst: (...args: unknown[]) => mockCourseFindFirst(...args) },
    lesson: { findMany: (...args: unknown[]) => mockLessonFindMany(...args) },
  },
}));

describe('EditCoursePage', () => {
  it('only queries published lessons for the import picker', async () => {
    mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'instructor-1' }));
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
