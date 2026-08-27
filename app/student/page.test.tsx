import StudentHomePage from './page';

const mockAuth = jest.fn();
const mockCurrentUser = jest.fn();
const mockUserFindUnique = jest.fn();
const mockEnrollmentFindMany = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      create: jest.fn(),
      update: jest.fn(),
    },
    enrollment: { findMany: (...args: unknown[]) => mockEnrollmentFindMany(...args) },
  },
}));

describe('StudentHomePage', () => {
  it('filters draft lessons and draft nodes from the student dashboard query', async () => {
    mockAuth.mockResolvedValue({ userId: 'student-clerk-1' });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'student@example.com' }],
      fullName: 'Student Example',
      firstName: 'Student',
    });
    mockUserFindUnique.mockResolvedValue({ id: 'student-1', email: 'student@example.com', name: 'Student Example' });
    mockEnrollmentFindMany.mockResolvedValue([]);

    await StudentHomePage();

    const query = mockEnrollmentFindMany.mock.calls[0][0];
    const courseLessons = query.include.course.include.courseLessons;
    expect(courseLessons.where).toEqual({ lesson: { isDraft: false } });
    expect(courseLessons.include.lesson.include.lessonNodes.where).toEqual({ node: { isDraft: false } });
  });
});
