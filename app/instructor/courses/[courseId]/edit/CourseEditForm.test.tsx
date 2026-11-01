import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CourseEditForm from './CourseEditForm';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
const originalFetch = global.fetch;
const course = {
  id: 'course-1',
  code: 'CH101',
  section: null,
  title: 'Chemistry',
  description: null,
  courseLessons: [],
  enrollments: [],
  contacts: [
    { id: 'jane', type: 'INSTRUCTOR', name: 'Jane Smith', email: 'jane@example.com', officeHours: 'Mondays, 2–4 PM' },
    { id: 'ali', type: 'INSTRUCTOR', name: 'Ali Khan', email: 'ali@example.com', officeHours: null },
    { id: 'checker', type: 'CHECKER', name: 'Checker', email: 'checker@example.com', officeHours: null },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});
afterEach(() => {
  global.fetch = originalFetch;
});

it('loads instructors, edits hours, adds and removes contacts, and saves them with stable IDs', async () => {
  render(<CourseEditForm course={course as never} availableLessons={[]} />);
  const jane = screen.getByRole('group', { name: 'Instructor 1' });
  expect(within(jane).getByLabelText('Name')).toHaveValue('Jane Smith');
  expect(within(jane).getByLabelText('Email')).toHaveValue('jane@example.com');
  expect(within(jane).getByLabelText('Office hours (optional)')).toHaveValue('Mondays, 2–4 PM');
  expect(screen.queryByDisplayValue('Checker')).not.toBeInTheDocument();
  fireEvent.change(within(jane).getByLabelText('Office hours (optional)'), {
    target: { value: 'Fridays · SCI 201 · 1–3 PM' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove instructor 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add instructor' }));
  const added = screen.getByRole('group', { name: 'Instructor 2' });
  fireEvent.change(within(added).getByLabelText('Name'), { target: { value: ' New Instructor ' } });
  fireEvent.change(within(added).getByLabelText('Email'), { target: { value: 'NEW@example.com' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form')!);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/instructor/courses'));
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/instructor/courses/course-1',
    expect.objectContaining({ method: 'PATCH' })
  );
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).instructorContacts).toEqual([
    { id: 'jane', name: 'Jane Smith', email: 'jane@example.com', officeHours: 'Fridays · SCI 201 · 1–3 PM' },
    { name: 'New Instructor', email: 'new@example.com', officeHours: null },
  ]);
});

it('allows clearing office hours and removing every instructor', async () => {
  render(<CourseEditForm course={course as never} availableLessons={[]} />);
  fireEvent.change(screen.getAllByLabelText('Office hours (optional)')[0], { target: { value: '' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form')!);
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).instructorContacts[0].officeHours).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remove instructor 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove instructor 1' }));
  expect(screen.getByText('No instructor contacts added.')).toBeInTheDocument();
  fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form')!);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).instructorContacts).toEqual([]);
});

it('rejects blank names before saving and keeps edits visible on server failure', async () => {
  render(<CourseEditForm course={course as never} availableLessons={[]} />);
  const name = screen.getAllByLabelText('Name')[0];
  fireEvent.change(name, { target: { value: '   ' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form')!);
  expect(screen.getByText(/Instructor 1: name is required/)).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
  fireEvent.change(name, { target: { value: 'Edited Jane' } });
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Unable to save contacts' }) });
  fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form')!);
  expect(await screen.findByText('Unable to save contacts')).toBeInTheDocument();
  expect(name).toHaveValue('Edited Jane');
  expect(mockPush).not.toHaveBeenCalled();
});
