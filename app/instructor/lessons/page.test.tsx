import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import { render, screen } from '@testing-library/react';
import LessonsPage from './page';
const mockLessons = jest.fn();
const mockCourses = jest.fn();
const mockGrid = jest.fn((props: unknown) => <div>{props ? 'Lesson grid' : ''}</div>);
jest.mock('@/lib/prisma', () => ({
  prisma: {
    lesson: { findMany: (...args: unknown[]) => mockLessons(...args) },
    course: { findMany: (...args: unknown[]) => mockCourses(...args) },
  },
}));
jest.mock('./LessonsGrid', () => ({ __esModule: true, default: (props: unknown) => mockGrid(props) }));
it('loads counts and only instructor-owned course associations, and passes URL state to the grid', async () => {
  mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'instructor-1' }));
  mockLessons.mockResolvedValue([]);
  mockCourses.mockResolvedValue([]);
  render(await LessonsPage({ searchParams: Promise.resolve({ drafts: '1', course: 'c1' }) }));
  expect(screen.getByRole('link', { name: '+ New lesson' })).toHaveAttribute('href', '/instructor/lessons/new');
  expect(mockLessons).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { OR: [{ createdByClerkId: 'instructor-1' }, { createdByClerkId: null }] },
      select: expect.objectContaining({
        _count: { select: { lessonNodes: true } },
        courseLessons: {
          where: { course: { createdByClerkId: 'instructor-1' } },
          select: { course: { select: { id: true, title: true } } },
        },
      }),
      orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }],
    })
  );
  expect(mockCourses).toHaveBeenCalledWith(expect.objectContaining({ where: { createdByClerkId: 'instructor-1' } }));
  expect(mockGrid).toHaveBeenCalledWith(
    expect.objectContaining({ initialFilters: expect.objectContaining({ draftOnly: true, course: 'c1' }) })
  );
});
