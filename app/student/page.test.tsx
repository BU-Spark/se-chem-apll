import { render, screen } from '@testing-library/react';
import StudentHomePage from './page';

const mockAuth = jest.fn();
const mockCurrentUser = jest.fn();
const mockUserFindUnique = jest.fn();
const mockEnrollmentFindMany = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
}));

jest.mock('@/app/components/NodePreview/NodePreview', () => ({
  __esModule: true,
  default: () => null,
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
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'student-clerk-1' });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'student@example.com' }],
      fullName: 'Student Example',
      firstName: 'Student',
    });
    mockUserFindUnique.mockResolvedValue({ id: 'student-1', email: 'student@example.com', name: 'Student Example' });
  });

  function enrollmentWithNode(quizQuestionCount: number) {
    return [
      {
        course: {
          id: 'course-1',
          title: 'Chemistry',
          code: 'CH101',
          section: null,
          description: null,
          courseLessons: [
            {
              openDate: null,
              dueDate: null,
              accessibleAfterDue: false,
              lesson: {
                id: 'lesson-1',
                title: 'Lesson 1',
                summary: '',
                estimatedMinutes: null,
                progress: [],
                lessonNodes: [
                  {
                    id: 'ln-1',
                    isRequired: false,
                    quizQuestionCount,
                    attempts: [],
                    node: { _count: { quizQuestions: 3 }, checkpoints: [] },
                  },
                ],
              },
            },
          ],
        },
      },
    ];
  }

  it('shows the quiz task when the instructor set a question count', async () => {
    mockEnrollmentFindMany.mockResolvedValue(enrollmentWithNode(2));
    render(await StudentHomePage());
    expect(screen.getByRole('link', { name: 'Start quiz' })).toBeInTheDocument();
  });

  it('hides the quiz task when quizQuestionCount is 0', async () => {
    mockEnrollmentFindMany.mockResolvedValue(enrollmentWithNode(0));
    render(await StudentHomePage());
    expect(screen.queryByText('Quiz')).not.toBeInTheDocument();
  });

  it('filters draft lessons and draft nodes from the student dashboard query', async () => {
    mockEnrollmentFindMany.mockResolvedValue([]);

    await StudentHomePage();

    const query = mockEnrollmentFindMany.mock.calls[0][0];
    const courseLessons = query.include.course.include.courseLessons;
    expect(courseLessons.where).toEqual({ lesson: { isDraft: false } });
    expect(courseLessons.include.lesson.include.lessonNodes.where).toEqual({ node: { isDraft: false } });
  });
});
