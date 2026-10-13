import { render, screen } from '@testing-library/react';
import CoursesPage from './page';
const mockAuth = jest.fn();
const mockCourses = jest.fn();
const mockGrid = jest.fn((props: unknown) => <div>{props ? 'Course grid' : ''}</div>);
jest.mock('@clerk/nextjs/server', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/prisma', () => ({ prisma: { course: { findMany: (...args: unknown[]) => mockCourses(...args) } } }));
jest.mock('./CoursesGrid', () => ({ __esModule: true, default: (props: unknown) => mockGrid(props) }));
it('preserves course visibility, fetches counts and passes URL state', async () => {
  mockAuth.mockResolvedValue({ userId: 'instructor-1' });
  mockCourses.mockResolvedValue([]);
  render(await CoursesPage({ searchParams: Promise.resolve({ sort: 'code:asc' }) }));
  expect(screen.getByRole('link', { name: '+ New course' })).toHaveAttribute('href', '/instructor/courses/new');
  expect(mockCourses).toHaveBeenCalledWith({
    where: { OR: [{ createdByClerkId: 'instructor-1' }, { createdByClerkId: null }] },
    select: {
      id: true,
      title: true,
      code: true,
      section: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { courseLessons: true, enrollments: { where: { role: 'STUDENT' } } } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  expect(mockGrid).toHaveBeenCalledWith(
    expect.objectContaining({ initialFilters: { sort: 'code:asc', gridFilters: {} } })
  );
});
