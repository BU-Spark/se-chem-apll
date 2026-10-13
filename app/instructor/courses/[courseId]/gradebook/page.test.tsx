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
import { render, screen } from '@testing-library/react';
import GradebookPage from './page';
const mockAuth = jest.fn();
const mockUser = jest.fn();
const mockCourse = jest.fn();
const mockProgress = jest.fn();
const mockGrid = jest.fn((props: unknown) => <div>{props ? 'Grid' : ''}</div>);
jest.mock('@clerk/nextjs/server', () => ({ auth: () => mockAuth(), currentUser: () => mockUser() }));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
  notFound: () => {
    throw new Error('Not found');
  },
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    course: { findFirst: (...args: unknown[]) => mockCourse(...args) },
    courseLessonProgress: { findMany: (...args: unknown[]) => mockProgress(...args) },
  },
}));
jest.mock('./Gradebook', () => ({ __esModule: true, default: (props: unknown) => mockGrid(props) }));
const params = Promise.resolve({ courseId: 'c1' });
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: 'i1' });
  mockUser.mockResolvedValue({ unsafeMetadata: { role: 'instructor' } });
  mockCourse.mockResolvedValue({
    id: 'c1',
    title: 'Chemistry',
    code: 'CHEM',
    section: 'A',
    enrollments: [{ student: { id: 's1', name: 'Amy', email: 'a@example.com' } }],
    courseLessons: [{ id: 'cl1', lesson: { title: 'Atoms' } }],
  });
  mockProgress.mockResolvedValue([
    {
      studentId: 's1',
      courseLessonId: 'cl1',
      status: 'COMPLETED',
      percentComplete: 100,
      submissions: [{ finalPercent: 0 }],
    },
  ]);
});
it('scopes results to course enrollment and assignments and preserves shared progress', async () => {
  render(await GradebookPage({ params }));
  expect(screen.getByRole('link', { name: 'Gradebook' })).toHaveAttribute('aria-current', 'page');
  expect(mockCourse.mock.calls[0][0].where).toEqual({
    id: 'c1',
    OR: [{ createdByClerkId: 'i1' }, { createdByClerkId: null }],
  });
  expect(mockProgress.mock.calls[0][0].where).toEqual({ studentId: { in: ['s1'] }, courseLessonId: { in: ['cl1'] } });
  expect(mockGrid.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      rows: [expect.objectContaining({ grades: { cl1: expect.objectContaining({ best: { finalPercent: 0 } }) } })],
    })
  );
  expect(screen.getByText(/Best final grades/)).toBeInTheDocument();
});
it('rejects non-instructors and inaccessible courses', async () => {
  mockUser.mockResolvedValue({ unsafeMetadata: { role: 'student' } });
  await expect(GradebookPage({ params })).rejects.toThrow('/student');
  expect(mockCourse).not.toHaveBeenCalled();
  mockUser.mockResolvedValue({ unsafeMetadata: { role: 'instructor' } });
  mockCourse.mockResolvedValue(null);
  await expect(GradebookPage({ params })).rejects.toThrow('Not found');
  expect(mockProgress).not.toHaveBeenCalled();
});
