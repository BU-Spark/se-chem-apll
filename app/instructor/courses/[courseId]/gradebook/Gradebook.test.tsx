import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Gradebook from './Gradebook';
import { gradeLabel, type GradeRow, type Submission, type Progress } from './types';
jest.mock('./ResultDetails', () => ({
  __esModule: true,
  default: ({ studentId, lessonId }: { studentId: string; lessonId: string }) => (
    <p>
      Details {studentId} {lessonId}
    </p>
  ),
}));
const lessons = [
  { id: 'l1', title: 'Atoms' },
  { id: 'l2', title: 'Molecules' },
];
const progress: Progress = {
  status: 'COMPLETED',
  percentComplete: 100,
  best: { finalPercent: 0, gradingStatus: 'GRADED' } as Submission,
};
const rows: GradeRow[] = [
  { id: 's1', name: 'Amy', email: 'amy@example.com', grades: { l1: progress } },
  {
    id: 's2',
    name: 'Zed',
    email: 'zed@example.com',
    grades: {
      l1: { ...progress, best: null },
      l2: { ...progress, status: 'IN_PROGRESS', percentComplete: 40, best: null },
    },
  },
];
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});
it('distinguishes zero, ungraded, in-progress and not-started results', async () => {
  render(<Gradebook courseId="c1" rows={rows} lessons={lessons} />);
  expect(await screen.findByText('0%')).toBeInTheDocument();
  expect(screen.getByText('Completed · ungraded')).toBeInTheDocument();
  expect(screen.getByText('In progress')).toBeInTheDocument();
  expect(screen.getByText('Not started')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Amy, Atoms: 0%. View results' }));
  expect(screen.getByText('Details s1 l1')).toBeInTheDocument();
});
it('filters live and resets filtering and sorting', async () => {
  const { container } = render(<Gradebook courseId="c1" rows={rows} lessons={lessons} />);
  fireEvent.input(await screen.findByLabelText('Atoms Filter Input'), { target: { value: 'ungraded' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 students'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 2 students'));
  fireEvent.click(screen.getByText('Student'));
  fireEvent.click(screen.getByRole('button', { name: 'Reset sorting' }));
  await waitFor(() =>
    expect(container.querySelector('.ag-row[row-index="0"] .ag-cell[col-id="name"]')).toHaveTextContent('Amy')
  );
});
it('handles no students and no lessons', () => {
  render(<Gradebook courseId="c1" rows={[]} lessons={[]} />);
  expect(screen.getByText(/No students enrolled/)).toBeInTheDocument();
  expect(screen.getByText(/No lessons assigned/)).toBeInTheDocument();
});
it('virtualizes large gradebooks', async () => {
  const { container } = render(
    <Gradebook
      courseId="c1"
      rows={Array.from({ length: 2000 }, (_, i) => ({ ...rows[0], id: String(i) }))}
      lessons={Array.from({ length: 100 }, (_, i) => ({ id: `l${i}`, title: `Lesson ${i}` }))}
    />
  );
  await waitFor(() => expect(container.querySelectorAll('.ag-cell').length).toBeGreaterThan(0));
  expect(container.querySelectorAll('.ag-cell[col-id="name"]').length).toBeLessThan(100);
});
it('formats recorded grades without turning absent grades into zero', () => {
  expect(gradeLabel()).toBe('Not started');
  expect(gradeLabel({ ...progress, best: { finalPercent: 84.125 } as Submission })).toBe('84.13%');
});
