import { render, screen } from '@testing-library/react';
import StudentsPage from './page';
const mockFindMany = jest.fn();
const mockGrid = jest.fn((props: unknown) => <div>{props ? 'Grid' : ''}</div>);
jest.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'i1' }) }));
jest.mock('@/lib/prisma', () => ({ prisma: { course: { findMany: (...args: unknown[]) => mockFindMany(...args) } } }));
jest.mock('./StudentsGrid', () => ({ __esModule: true, default: (props: unknown) => mockGrid(props) }));
it('preserves visibility, selects only student enrollments and deduplicates the summary', async () => {
  const student = { id: 's1', name: 'Student', email: 's@example.com' };
  mockFindMany.mockResolvedValue(
    ['a', 'b'].map((id) => ({ id, title: id, code: id, section: null, enrollments: [{ student }] }))
  );
  render(await StudentsPage({ searchParams: Promise.resolve({ sort: 'za' }) }));
  expect(screen.getByText('1 enrolled student across 2 courses')).toBeInTheDocument();
  expect(mockFindMany).toHaveBeenCalledWith({
    where: { OR: [{ createdByClerkId: 'i1' }, { createdByClerkId: null }] },
    select: {
      id: true,
      title: true,
      code: true,
      section: true,
      enrollments: {
        where: { role: 'STUDENT' },
        select: { student: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
  });
  expect(mockGrid).toHaveBeenCalledWith(expect.objectContaining({ initialFilters: { sort: 'za', gridFilters: {} } }));
});
