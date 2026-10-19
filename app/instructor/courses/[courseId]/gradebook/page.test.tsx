import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import { render, screen } from '@testing-library/react';
import GradebookPage from './page';
const mockCourse = jest.fn();
const mockProgress = jest.fn();
const mockGrid = jest.fn((props: unknown) => <div>{props ? 'Grid' : ''}</div>);
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
  mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'i1' }));
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
  mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 's1', appRole: 'STUDENT' }));
  await expect(GradebookPage({ params })).rejects.toThrow('/student');
  expect(mockCourse).not.toHaveBeenCalled();
  mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'i1' }));
  mockCourse.mockResolvedValue(null);
  await expect(GradebookPage({ params })).rejects.toThrow('Not found');
  expect(mockProgress).not.toHaveBeenCalled();
});
