import { render, screen, within } from '@testing-library/react';
import StudentProfilePage from './page';

const mockRequireStudent = jest.fn();
const mockGetStudentInstructors = jest.fn();

jest.mock('@/lib/auth/server', () => ({ requireStudent: () => mockRequireStudent() }));

jest.mock('@/lib/studentCourses', () => ({
  getStudentInstructors: (...args: unknown[]) => mockGetStudentInstructors(...args),
}));

describe('StudentProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireStudent.mockResolvedValue({ id: 'student-1', name: 'Hannah Yu', email: 'hannahyu@bu.edu' });
    mockGetStudentInstructors.mockResolvedValue([
      {
        id: 'contact-1',
        name: 'Jane Smith',
        email: 'janesmith@bu.edu',
        officeHours: 'Mondays · SCI 102 · 1–3 PM\nOnline by appointment',
        course: { code: 'CH101', section: 'A1', title: 'Chemistry' },
      },
      {
        id: 'contact-3',
        name: 'Ali Khan',
        email: 'alikhan@bu.edu',
        officeHours: null,
        course: { code: 'CH102', section: null, title: 'Chemistry II' },
      },
    ]);
  });

  it("shows the student's name and email", async () => {
    render(await StudentProfilePage());

    const card = screen.getByRole('region', { name: 'Student' });
    expect(within(card).getByText('Hannah Yu')).toBeInTheDocument();
    expect(within(card).getByText('hannahyu@bu.edu')).toBeInTheDocument();
  });

  it('shows real office hours and course identification', async () => {
    render(await StudentProfilePage());

    expect(mockGetStudentInstructors).toHaveBeenCalledWith('student-1');
    expect(screen.getAllByRole('region', { name: /^Instructor/ })).toHaveLength(2);

    const jane = screen.getByRole('region', { name: 'Instructor Jane Smith' });
    expect(within(jane).getByText('janesmith@bu.edu')).toBeInTheDocument();
    expect(within(jane).getByText('Mondays · SCI 102 · 1–3 PM')).toBeInTheDocument();
    expect(within(jane).getByText('Online by appointment')).toBeInTheDocument();
    expect(within(jane).getByText('CH101 · A1 — Chemistry')).toBeInTheDocument();
  });

  it('shows a dash when the student has no name yet', async () => {
    mockRequireStudent.mockResolvedValue({ id: 'student-1', name: null, email: 'hannahyu@bu.edu' });
    mockGetStudentInstructors.mockResolvedValue([]);
    render(await StudentProfilePage());

    expect(within(screen.getByRole('region', { name: 'Student' })).getByText('—')).toBeInTheDocument();
  });
});

it.each([null, '', '   '])(
  'omits office hours when missing (%j) and never shows placeholder text',
  async (officeHours) => {
    mockGetStudentInstructors.mockResolvedValue([
      {
        id: 'contact-1',
        name: 'Jane Smith',
        email: 'jane@example.com',
        officeHours,
        course: { code: 'CH101', section: null, title: 'Chemistry' },
      },
    ]);
    render(await StudentProfilePage());
    expect(screen.queryByText('Office Hours')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tuesdays & Fridays|SCI 201|2-4PM/)).not.toBeInTheDocument();
  }
);

it('shows different hours for one instructor teaching two enrolled courses', async () => {
  mockGetStudentInstructors.mockResolvedValue([
    {
      id: 'a',
      name: 'Jane Smith',
      email: 'jane@example.com',
      officeHours: 'Mondays, 1–2 PM',
      course: { code: 'CH101', section: 'A1', title: 'Chemistry' },
    },
    {
      id: 'b',
      name: 'Jane Smith',
      email: 'jane@example.com',
      officeHours: 'Fridays, 3–4 PM',
      course: { code: 'CH102', section: null, title: 'Chemistry II' },
    },
  ]);
  render(await StudentProfilePage());
  expect(screen.getAllByRole('region', { name: 'Instructor Jane Smith' })).toHaveLength(2);
  expect(screen.getByText('Mondays, 1–2 PM')).toBeInTheDocument();
  expect(screen.getByText('Fridays, 3–4 PM')).toBeInTheDocument();
});
