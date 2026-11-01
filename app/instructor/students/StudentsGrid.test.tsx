import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentsGrid from './StudentsGrid';
import { readStudentFilters, type StudentCourseItem } from './listFilters';
const courses: StudentCourseItem[] = [
  {
    id: 'a',
    title: 'Alpha',
    code: 'CHEM',
    section: 'A',
    enrollments: ['Amy', 'Bea', 'Cat', 'Zed'].map((name) => ({
      student: { id: name, name, email: `${name.toLowerCase()}@example.com` },
    })),
  },
  { id: 'b', title: 'Beta', code: 'BIO', section: null, enrollments: [] },
];
function setup() {
  return render(<StudentsGrid courses={courses} initialFilters={readStudentFilters({})} />);
}
beforeEach(() => window.history.replaceState(null, '', '/instructor/students'));
it('links to management in either tab and searches students beyond the preview', async () => {
  setup();
  expect(await screen.findByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/instructor/courses/a/students');
  expect(screen.getByRole('link', { name: 'Open Alpha student management in new tab' })).toHaveAttribute(
    'target',
    '_blank'
  );
  expect(screen.getByText('Amy, Bea, Cat · +1 more')).toBeInTheDocument();
  fireEvent.input(screen.getByLabelText('Enrolled students Filter Input'), { target: { value: 'zed@example.com' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 courses'));
  expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
  await waitFor(() => expect(window.location.search).toContain('zed'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 2 courses'));
  expect(screen.getByText('No students enrolled')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Manage students for Beta (0)' })).toHaveAttribute(
    'href',
    '/instructor/courses/b/students'
  );
});
it('restores filters and sorting from history and resets to course A–Z', async () => {
  const { container } = setup();
  await screen.findByText('Alpha');
  act(() => {
    const filters = JSON.stringify({ studentCount: { filterType: 'number', type: 'equals', filter: 0 } });
    window.history.pushState(null, '', `/instructor/students?sort=za&filters=${encodeURIComponent(filters)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 courses'));
  expect(screen.getByRole('link', { name: 'Beta' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset sorting' }));
  await waitFor(() =>
    expect(container.querySelector('.ag-row[row-index="0"] .ag-cell[col-id="title"]')).toHaveTextContent('Alpha')
  );
});
it('keeps large libraries virtualized', async () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ ...courses[0], id: String(i), title: `Course ${i}` }));
  const { container } = render(<StudentsGrid courses={many} initialFilters={readStudentFilters({})} />);
  await waitFor(() => expect(container.querySelectorAll('.ag-cell[col-id="title"]').length).toBeGreaterThan(0));
  expect(container.querySelectorAll('.ag-cell[col-id="title"]').length).toBeLessThan(100);
});
it('offers course creation for an empty library', () => {
  render(<StudentsGrid courses={[]} initialFilters={readStudentFilters({})} />);
  expect(screen.getByRole('link', { name: 'Create a course' })).toHaveAttribute('href', '/instructor/courses/new');
});
