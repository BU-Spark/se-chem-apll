import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CoursesGrid from './CoursesGrid';
import { readCourseFilters, type CourseListItem } from './listFilters';
const courses: CourseListItem[] = [
  {
    id: 'a',
    title: 'Alpha',
    code: 'CHEM-101',
    section: 'A',
    description: 'Chemistry',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    _count: { courseLessons: 3, enrollments: 2 },
  },
  {
    id: 'b',
    title: 'Beta',
    code: 'BIO-101',
    section: null,
    description: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-03'),
    _count: { courseLessons: 0, enrollments: 0 },
  },
];
function setup() {
  return render(<CoursesGrid courses={courses} initialFilters={readCourseFilters({})} />);
}
beforeEach(() => window.history.replaceState(null, '', '/instructor/courses'));
it('links titles, new-tab icons, and student counts including zero', async () => {
  setup();
  expect(await screen.findByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/instructor/courses/a/edit');
  expect(screen.getByRole('link', { name: 'Alpha' })).not.toHaveAttribute('target');
  const icon = screen.getByRole('link', { name: 'Open Alpha editor in new tab' });
  expect(icon).toHaveAttribute('target', '_blank');
  expect(icon).toHaveAttribute('href', '/instructor/courses/a/edit');
  expect(screen.getByRole('link', { name: 'Manage students for Beta (0)' })).toHaveAttribute(
    'href',
    '/instructor/courses/b/students'
  );
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
});
it('combines native text and numeric filters live and clears them', async () => {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const view = setup();
  try {
    fireEvent.input(await screen.findByLabelText('Course code Filter Input'), { target: { value: 'chem' } });
    fireEvent.input(screen.getByLabelText('Section Filter Input'), { target: { value: 'A' } });
    await user.type(screen.getByRole('spinbutton', { name: 'Students Filter Input' }), '2');
    // Apply AG Grid's 150 ms debounce without depending on coverage/runner speed.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 courses'));
    expect(JSON.parse(new URLSearchParams(window.location.search).get('filters') ?? '{}')).toEqual({
      code: { filterType: 'text', type: 'contains', filter: 'chem' },
      section: { filterType: 'text', type: 'contains', filter: 'A' },
      studentCount: { filterType: 'number', type: 'equals', filter: 2 },
    });
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 2 courses'));
    expect(screen.getByLabelText('Course code Filter Input')).toHaveValue('');
    expect(screen.getByLabelText('Section Filter Input')).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'Students Filter Input' })).toHaveValue(null);
    expect(new URLSearchParams(window.location.search).has('filters')).toBe(false);
  } finally {
    view.unmount();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
it('sorts headers, restores history filters and resets to newest updates', async () => {
  const { container } = setup();
  await screen.findByText('Alpha');
  const first = () => container.querySelector('.ag-row[row-index="0"] .ag-cell[col-id="title"]')?.textContent;
  await waitFor(() => expect(first()).toBe('Beta'));
  fireEvent.click(screen.getByText('Title'));
  await waitFor(() => expect(first()).toBe('Alpha'));
  await waitFor(() => expect(window.location.search).toContain('sort=az'));
  act(() => {
    const filters = JSON.stringify({
      lessonCount: { filterType: 'number', type: 'greaterThan', filter: 1 },
      updatedAt: { filterType: 'date', type: 'equals', dateFrom: '2026-01-02 00:00:00' },
    });
    window.history.pushState(null, '', `/instructor/courses?sort=za&filters=${encodeURIComponent(filters)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 courses'));
  expect(first()).toBe('Alpha');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset sorting' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 2 courses'));
  await waitFor(() => expect(first()).toBe('Beta'));
});
it('shows the empty library message', () => {
  render(<CoursesGrid courses={[]} initialFilters={readCourseFilters({})} />);
  expect(screen.getByText('No courses yet. Create your first one above.')).toBeInTheDocument();
});
it('virtualizes large lists', async () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ ...courses[0], id: String(i), title: `Course ${i}` }));
  const { container } = render(<CoursesGrid courses={many} initialFilters={readCourseFilters({})} />);
  await waitFor(() => expect(container.querySelectorAll('.ag-cell[col-id="title"]').length).toBeGreaterThan(0));
  expect(container.querySelectorAll('.ag-cell[col-id="title"]').length).toBeLessThan(100);
});
