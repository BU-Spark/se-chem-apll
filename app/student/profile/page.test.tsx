import { render, screen, within } from '@testing-library/react';
import StudentProfilePage from './page';

const mockGetOrCreateStudent = jest.fn();
const mockGetStudentInstructors = jest.fn();

jest.mock('@/lib/getOrCreateStudent', () => ({
  getOrCreateStudent: () => mockGetOrCreateStudent(),
}));

jest.mock('@/lib/studentCourses', () => ({
  getStudentInstructors: (...args: unknown[]) => mockGetStudentInstructors(...args),
}));

describe('StudentProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOrCreateStudent.mockResolvedValue({ id: 'student-1', name: 'Hannah Yu', email: 'hannahyu@bu.edu' });
    mockGetStudentInstructors.mockResolvedValue([
      { id: 'contact-1', name: 'Jane Smith', email: 'janesmith@bu.edu' },
      { id: 'contact-3', name: 'Ali Khan', email: 'alikhan@bu.edu' },
    ]);
  });

  it("shows the student's name and email", async () => {
    render(await StudentProfilePage());

    const card = screen.getByRole('region', { name: 'Student' });
    expect(within(card).getByText('Hannah Yu')).toBeInTheDocument();
    expect(within(card).getByText('hannahyu@bu.edu')).toBeInTheDocument();
  });

  it('shows a card per instructor with mock office hours', async () => {
    render(await StudentProfilePage());

    expect(mockGetStudentInstructors).toHaveBeenCalledWith('student-1');
    expect(screen.getAllByRole('region', { name: /^Instructor/ })).toHaveLength(2);

    const jane = screen.getByRole('region', { name: 'Instructor Jane Smith' });
    expect(within(jane).getByText('janesmith@bu.edu')).toBeInTheDocument();
    expect(within(jane).getByText('Tuesdays & Fridays')).toBeInTheDocument();
  });

  it('shows a dash when the student has no name yet', async () => {
    mockGetOrCreateStudent.mockResolvedValue({ id: 'student-1', name: null, email: 'hannahyu@bu.edu' });
    mockGetStudentInstructors.mockResolvedValue([]);
    render(await StudentProfilePage());

    expect(within(screen.getByRole('region', { name: 'Student' })).getByText('—')).toBeInTheDocument();
  });
});
