import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CopyForm from './CopyForm';

const push = jest.fn(),
  refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
const props = {
  courses: [
    {
      id: 'source',
      title: 'Chemistry',
      code: 'CHEM',
      section: 'A',
      description: 'Source description',
      courseLessons: [{ lessonId: 'l1', openDate: '2026-01-01T12:00:00Z', dueDate: null, lateDeadline: null }],
    },
  ],
  lessons: [{ id: 'l1', title: 'Atoms', isDraft: false, lessonNodes: [{ nodeId: 'n1' }] }],
  nodes: [{ id: 'n1', title: 'Atomic structure', isDraft: false }],
  destinations: [{ id: 'destination', title: 'My course' }],
  destinationLessons: [{ id: 'lesson-destination', title: 'My lesson' }],
  initial: { mode: 'course', sourceCourseId: 'source', destinationId: '', lessonId: '', nodeId: '' },
};
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ redirect: '/instructor/courses/new-copy/edit' }) });
});
afterEach(() => {
  global.fetch = originalFetch;
});

it('prefills and previews a duplicate without writing until the instructor submits', async () => {
  render(<CopyForm {...props} />);
  expect(screen.getByLabelText('Title')).toHaveValue('Chemistry (copy)');
  expect(screen.getByLabelText('Course code')).toHaveValue('CHEM');
  expect(screen.getByText(/1 lessons and 1 unique nodes/)).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate course' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/instructor/courses/new-copy/edit'));
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
    mode: 'course',
    sourceCourseId: 'source',
    section: 'B',
    title: 'Chemistry (copy)',
  });
  expect(refresh).toHaveBeenCalled();
});
it('selects lessons and makes schedule copying opt-in', async () => {
  render(<CopyForm {...props} initial={{ ...props.initial, mode: 'lessons', destinationId: 'destination' }} />);
  expect(screen.getByRole('button', { name: 'Copy selected lessons' })).toBeDisabled();
  expect(screen.getByLabelText('Copy source schedule and late-submission policies')).not.toBeChecked();
  fireEvent.click(screen.getByLabelText('Atoms'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy selected lessons' }));
  await waitFor(() => expect(push).toHaveBeenCalled());
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
    mode: 'lessons',
    lessonIds: ['l1'],
    destinationId: 'destination',
    copySchedule: false,
  });
});
it('shows server errors and preserves selections for correction', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Code already exists.' }) });
  render(<CopyForm {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate course' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Code already exists.');
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveValue('Chemistry (copy)');
});
