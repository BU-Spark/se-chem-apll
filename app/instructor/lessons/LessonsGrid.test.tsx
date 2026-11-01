import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LessonsGrid from './LessonsGrid';
import { readLessonFilters, type LessonListItem } from './listFilters';
const courses = [{ id: 'c1', title: 'Chemistry' }];
const lessons: LessonListItem[] = [
  {
    id: 'a',
    title: 'Alpha',
    summary: '',
    isDraft: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    _count: { lessonNodes: 3 },
    courseLessons: [{ course: courses[0] }],
  },
  {
    id: 'b',
    title: 'Beta',
    summary: '',
    isDraft: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-03'),
    _count: { lessonNodes: 0 },
    courseLessons: [],
  },
];
function setup() {
  return render(<LessonsGrid lessons={lessons} courses={courses} initialFilters={readLessonFilters({})} />);
}
beforeEach(() => window.history.replaceState(null, '', '/instructor/lessons'));
it('combines native title filtering with course and draft controls, and clears them', async () => {
  setup();
  expect(await screen.findByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/instructor/lessons/a/edit');
  fireEvent.input(screen.getByLabelText('Title Filter Input'), { target: { value: 'alpha' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 lessons'));
  fireEvent.change(screen.getByLabelText('My course'), { target: { value: 'c1' } });
  fireEvent.click(screen.getByRole('switch', { name: 'Drafts only' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0 of 2 lessons'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 2 lessons'));
  expect(screen.getByLabelText('My course')).toHaveValue('');
});
it('filters boolean usage on the first selection and opens associated courses', async () => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  setup();
  await userEvent.selectOptions(await screen.findByLabelText('Filter course usage'), 'true');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 lessons'));
  fireEvent.click(screen.getByRole('button', { name: 'View courses using Alpha' }));
  expect(screen.getByText('Chemistry', { selector: 'a' })).toHaveAttribute('href', '/instructor/courses/c1/edit');
  await userEvent.selectOptions(screen.getByLabelText('Filter course usage'), 'false');
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Alpha' })).not.toBeInTheDocument());
  expect(screen.getByRole('link', { name: 'Beta' })).toBeInTheDocument();
});
it('restores numeric/date filters and sorting from history, and resets sorting', async () => {
  const { container } = setup();
  await screen.findByText('Alpha');
  act(() => {
    const filters = JSON.stringify({
      nodeCount: { filterType: 'number', type: 'greaterThan', filter: 1 },
      updatedAt: { filterType: 'date', type: 'equals', dateFrom: '2026-01-02 00:00:00' },
    });
    window.history.pushState(null, '', `/instructor/lessons?sort=az&filters=${encodeURIComponent(filters)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 lessons'));
  expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 2 lessons'));
  const first = () => container.querySelector('.ag-row[row-index="0"] .ag-cell[col-id="title"]')?.textContent;
  await waitFor(() => expect(first()).toBe('Alpha'));
  fireEvent.click(screen.getByRole('button', { name: 'Reset sorting' }));
  await waitFor(() => expect(first()).toBe('Beta'));
  fireEvent.click(screen.getByText('Title'));
  await waitFor(() => expect(first()).toBe('Alpha'));
});
it('keeps large lesson lists virtualized', async () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ ...lessons[0], id: String(i), title: `Lesson ${i}` }));
  const { container } = render(<LessonsGrid lessons={many} courses={courses} initialFilters={readLessonFilters({})} />);
  await waitFor(() => expect(container.querySelectorAll('.ag-cell[col-id="title"]').length).toBeGreaterThan(0));
  expect(container.querySelectorAll('.ag-cell[col-id="title"]').length).toBeLessThan(100);
});
