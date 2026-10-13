import { render, screen } from '@testing-library/react';
import StudentHomePage from './page';

const mockEnrollments = jest.fn();
const mockTimeline = jest.fn(() => null);
jest.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: 'clerk-1' }),
  currentUser: async () => ({ emailAddresses: [{ emailAddress: 'student@example.com' }] }),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: async () => ({ id: 'student-1', name: 'Student' }) },
    enrollment: { findMany: () => mockEnrollments() },
  },
}));
jest.mock('@/app/components/StudentDailyTimeline/StudentDailyTimeline', () => ({
  __esModule: true,
  default: (...args: []) => mockTimeline(...args),
}));
jest.mock('@/app/components/NodePreview/NodePreview', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/components/StudentQuizTaskList/StudentQuizTaskList', () => ({
  __esModule: true,
  default: () => null,
}));

it('hides expired lessons everywhere while keeping visible lessons available for review', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-13T12:00:00Z'));
  const assignment = (id: string, hideAfterDue: boolean) => ({
    id,
    openDate: new Date('2026-10-01T00:00:00Z'),
    dueDate: new Date('2026-10-12T12:00:00Z'),
    hideAfterDue,
    lateDeadline: null,
    latePenaltyType: 'NONE',
    latePenaltyPercent: 0,
    lesson: {
      id,
      title: id,
      summary: null,
      estimatedMinutes: null,
      lessonNodes: [],
      progress: [{ startedAt: new Date('2026-10-13T11:00:00Z') }],
    },
  });
  mockEnrollments.mockResolvedValue([
    {
      course: {
        id: 'course-1',
        title: 'Course',
        code: 'C101',
        courseLessons: [
          assignment('Hidden lesson', true),
          assignment('Review lesson', false),
          {
            ...assignment('Late lesson', false),
            lateDeadline: new Date('2026-10-14T12:00:00Z'),
            latePenaltyType: 'HOURLY',
            latePenaltyPercent: 1,
          },
        ],
      },
    },
  ]);
  try {
    render(await StudentHomePage());
    expect(screen.queryByText('Hidden lesson')).not.toBeInTheDocument();
    expect(screen.getByText('Review lesson')).toBeInTheDocument();
    expect(screen.getByText('Submissions closed')).toBeInTheDocument();
    expect(screen.getByText(/1% of the earned score deducted per hour/)).toBeInTheDocument();
    expect(mockTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            lessons: [
              expect.objectContaining({ title: 'Review lesson' }),
              expect.objectContaining({ title: 'Late lesson' }),
            ],
          }),
        ],
      }),
      undefined
    );
  } finally {
    jest.useRealTimers();
  }
});
