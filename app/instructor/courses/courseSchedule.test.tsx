import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CourseCreateForm from './new/CourseCreateForm';
import CourseEditForm from './[courseId]/edit/CourseEditForm';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
const lesson = { id: 'lesson-1', title: 'Chemistry', slug: 'chemistry' };
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});
afterEach(() => {
  global.fetch = originalFetch;
});

it('creates a course with a precise UTC deadline and hourly penalty', async () => {
  render(<CourseCreateForm availableLessons={[lesson]} />);
  fireEvent.change(screen.getByLabelText(/Course code/), { target: { value: 'CHEM101' } });
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Chemistry course' } });
  fireEvent.click(screen.getByRole('button', { name: 'Chemistry chemistry' }));
  fireEvent.change(screen.getByLabelText('Due date (UTC)'), { target: { value: '2026-10-12T12:30' } });
  fireEvent.change(screen.getByLabelText('Late submission deadline (UTC)'), { target: { value: '2026-10-14T12:30' } });
  expect(screen.getByLabelText('Hide lesson after due date')).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Late submission penalty'), { target: { value: 'HOURLY' } });
  fireEvent.change(screen.getByLabelText('Deduction (%)'), { target: { value: '0.5' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Create course' }).closest('form')!);
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.lessons[0]).toEqual({
    lessonId: 'lesson-1',
    sortOrder: 0,
    openDate: null,
    dueDate: '2026-10-12T12:30Z',
    lateDeadline: '2026-10-14T12:30Z',
    hideAfterDue: false,
    latePenaltyType: 'HOURLY',
    latePenaltyPercent: 0.5,
  });
});

it('blocks conflicting visibility and a late window before submitting', () => {
  render(<CourseCreateForm availableLessons={[lesson]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Chemistry chemistry' }));
  fireEvent.change(screen.getByLabelText('Due date (UTC)'), { target: { value: '2026-10-12T12:30' } });
  fireEvent.change(screen.getByLabelText('Late submission deadline (UTC)'), { target: { value: '2026-10-14T12:30' } });
  fireEvent.click(screen.getByLabelText('Hide lesson after due date'));
  fireEvent.submit(screen.getByRole('button', { name: 'Create course' }).closest('form')!);
  expect(screen.getByText(/Uncheck Hide lesson after due date/)).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

it('loads and saves an existing daily policy without changing timestamps', async () => {
  const course = {
    id: 'course-1',
    code: 'CHEM101',
    title: 'Chemistry course',
    section: null,
    description: null,
    enrollments: [],
    contacts: [],
    courseLessons: [
      {
        lessonId: lesson.id,
        lesson,
        openDate: null,
        dueDate: new Date('2026-10-12T12:30:12.123Z'),
        lateDeadline: new Date('2026-10-14T12:30:00Z'),
        hideAfterDue: false,
        latePenaltyType: 'DAILY',
        latePenaltyPercent: 10,
      },
    ],
  };
  render(<CourseEditForm course={course as never} availableLessons={[lesson]} />);
  expect(screen.getByLabelText('Due date (UTC)')).toHaveValue('2026-10-12T12:30');
  expect(screen.getByLabelText('Due date (UTC)')).toHaveAttribute('step', '60');
  expect(screen.getByLabelText('Late submission penalty')).toHaveValue('DAILY');
  expect(screen.getByLabelText('Deduction (%)')).toHaveValue(10);
  expect(screen.getByLabelText('Hide lesson after due date')).not.toBeChecked();
  fireEvent.submit(screen.getByRole('button', { name: /Save/ }).closest('form')!);
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.lessons[0]).toMatchObject({
    dueDate: '2026-10-12T12:30:12.123Z',
    hideAfterDue: false,
    latePenaltyType: 'DAILY',
    latePenaltyPercent: 10,
  });
});

const scheduledCourse = {
  id: 'course-1',
  code: 'CHEM101',
  title: 'Chemistry course',
  section: null,
  description: null,
  enrollments: [],
  contacts: [],
  courseLessons: [
    {
      lessonId: lesson.id,
      lesson,
      openDate: new Date('2026-10-10T12:30Z'),
      dueDate: new Date('2026-10-12T12:30Z'),
      lateDeadline: new Date('2026-10-14T12:30Z'),
      hideAfterDue: false,
      latePenaltyType: 'DAILY',
      latePenaltyPercent: 10,
    },
    {
      lessonId: 'lesson-2',
      lesson: { id: 'lesson-2', title: 'Physics' },
      openDate: null,
      dueDate: new Date('2026-10-20T12:30Z'),
      lateDeadline: null,
      hideAfterDue: false,
      latePenaltyType: 'NONE',
      latePenaltyPercent: 0,
    },
  ],
};

it('previews and shifts every date once, preserves blanks, and saves the shifted schedule', async () => {
  render(<CourseEditForm course={scheduledCourse as never} availableLessons={[]} />);
  fireEvent.change(screen.getAllByLabelText('Open date (UTC)')[0], { target: { value: '2026-10-11T12:30' } });
  expect(await screen.findByRole('dialog', { name: 'Shift the other dates?' })).toBeInTheDocument();
  expect(screen.getByText(/forward by 1 day/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(global.fetch).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Shift all dates' }));
  expect(screen.getAllByLabelText('Open date (UTC)')[0]).toHaveValue('2026-10-11T12:30');
  expect(screen.getAllByLabelText('Open date (UTC)')[1]).toHaveValue('');
  expect(screen.getAllByLabelText('Due date (UTC)')[0]).toHaveValue('2026-10-13T12:30');
  expect(screen.getAllByLabelText('Due date (UTC)')[1]).toHaveValue('2026-10-21T12:30');
  fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form')!);
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.lessons[0]).toMatchObject({
    openDate: '2026-10-11T12:30:00.000Z',
    dueDate: '2026-10-13T12:30:00.000Z',
    lateDeadline: '2026-10-15T12:30:00.000Z',
    latePenaltyPercent: 10,
  });
  expect(body.lessons[1]).toMatchObject({ openDate: null, lateDeadline: null });
});

it('can decline the shift, undo the change, then apply a new delta', async () => {
  render(<CourseEditForm course={scheduledCourse as never} availableLessons={[]} />);
  const open = screen.getAllByLabelText('Open date (UTC)')[0];
  fireEvent.change(open, { target: { value: '2026-10-09T12:30' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Only change this date' }));
  expect(open).toHaveValue('2026-10-09T12:30');
  expect(screen.getAllByLabelText('Due date (UTC)')[0]).toHaveValue('2026-10-12T12:30');
  fireEvent.click(screen.getByRole('button', { name: 'Undo date change' }));
  expect(open).toHaveValue('2026-10-10T12:30');
  fireEvent.change(open, { target: { value: '2026-10-12T12:30' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Shift all dates' }));
  expect(screen.getAllByLabelText('Due date (UTC)')[0]).toHaveValue('2026-10-14T12:30');
});

it('does not prompt when adding or clearing an open date', () => {
  render(<CourseEditForm course={scheduledCourse as never} availableLessons={[]} />);
  fireEvent.change(screen.getAllByLabelText('Open date (UTC)')[1], { target: { value: '2026-10-19T12:30' } });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.change(screen.getAllByLabelText('Open date (UTC)')[0], { target: { value: '' } });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

describe('reactive schedule preview', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const pause = () =>
    act(() => {
      jest.advanceTimersByTime(400);
    });

  it('waits for a typing pause, then follows further edits using the original baseline', () => {
    render(<CourseEditForm course={scheduledCourse as never} availableLessons={[]} />);
    const open = screen.getAllByLabelText('Open date (UTC)')[0];
    fireEvent.focus(open);
    fireEvent.change(open, { target: { value: '2026-10-11T12:30' } });
    expect(open).toHaveValue('2026-10-11T12:30');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.change(open, { target: { value: '2026-10-12T12:30' } });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    pause();
    expect(screen.getByText(/forward by 2 days/)).toBeInTheDocument();
    fireEvent.change(open, { target: { value: '2026-10-13T12:30' } });
    expect(screen.getByText(/forward by 3 days/)).toBeInTheDocument();
    expect(screen.getAllByLabelText('Due date (UTC)')[0]).toHaveValue('2026-10-12T12:30');
    expect(screen.getAllByLabelText('Due date (UTC)')[1]).toHaveValue('2026-10-20T12:30');
    fireEvent.click(screen.getByRole('button', { name: 'Shift all dates' }));
    expect(open).toHaveValue('2026-10-13T12:30');
    expect(screen.getAllByLabelText('Due date (UTC)')[0]).toHaveValue('2026-10-15T12:30');
    expect(screen.getAllByLabelText('Due date (UTC)')[1]).toHaveValue('2026-10-23T12:30');
    fireEvent.click(screen.getByRole('button', { name: 'Undo date change' }));
    expect(open).toHaveValue('2026-10-10T12:30');
    expect(screen.getAllByLabelText('Due date (UTC)')[0]).toHaveValue('2026-10-12T12:30');
  });

  it('hides unfinished previews and restores the original baseline after typing resumes', () => {
    render(<CourseEditForm course={scheduledCourse as never} availableLessons={[]} />);
    const open = screen.getAllByLabelText('Open date (UTC)')[0];
    fireEvent.focus(open);
    fireEvent.change(open, { target: { value: '2026-10-11T12:30' } });
    pause();
    expect(screen.getByRole('button', { name: 'Shift all dates' })).toBeEnabled();
    fireEvent.change(open, { target: { value: '' } });
    pause();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.change(open, { target: { value: '2026-10-14T12:30' } });
    pause();
    expect(screen.getByText(/forward by 4 days/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Only change this date' }));
    expect(open).toHaveValue('2026-10-14T12:30');
    expect(screen.getAllByLabelText('Due date (UTC)')[0]).toHaveValue('2026-10-12T12:30');
    fireEvent.change(open, { target: { value: '2026-10-15T12:30' } });
    pause();
    expect(screen.getByText(/forward by 1 day/)).toBeInTheDocument();
  });

  it('removes the prompt when the date returns to its original value', () => {
    render(<CourseEditForm course={scheduledCourse as never} availableLessons={[]} />);
    const open = screen.getAllByLabelText('Open date (UTC)')[0];
    fireEvent.change(open, { target: { value: '2026-10-11T12:30' } });
    pause();
    fireEvent.change(open, { target: { value: '2026-10-10T12:30' } });
    pause();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('preserves other draft changes when applying and undoing the latest shift', () => {
    render(<CourseEditForm course={scheduledCourse as never} availableLessons={[]} />);
    const open = screen.getAllByLabelText('Open date (UTC)')[0];
    const due = screen.getAllByLabelText('Due date (UTC)')[0];
    fireEvent.change(open, { target: { value: '2026-10-11T12:30' } });
    pause();
    fireEvent.change(due, { target: { value: '2026-10-13T12:30' } });
    fireEvent.click(screen.getByLabelText('Deduction (%)'));
    fireEvent.change(screen.getByLabelText('Deduction (%)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Shift all dates' }));
    expect(due).toHaveValue('2026-10-14T12:30');
    fireEvent.click(screen.getByRole('button', { name: 'Undo date change' }));
    expect(open).toHaveValue('2026-10-10T12:30');
    expect(due).toHaveValue('2026-10-13T12:30');
    expect(screen.getByLabelText('Deduction (%)')).toHaveValue(15);
  });
});
