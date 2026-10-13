import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
