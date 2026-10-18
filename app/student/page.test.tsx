import { render, screen, within } from '@testing-library/react';
import StudentHomePage from './page';

const mockGetOrCreateStudent = jest.fn();
const mockGetEnrolledCourses = jest.fn();

jest.mock('@/lib/getOrCreateStudent', () => ({ getOrCreateStudent: () => mockGetOrCreateStudent() }));
jest.mock('@/lib/studentCourses', () => ({
  getEnrolledCourses: (...args: unknown[]) => mockGetEnrolledCourses(...args),
}));

describe('StudentHomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOrCreateStudent.mockResolvedValue({
      id: 'student-1',
      name: 'Student Example',
      email: 'student@example.com',
    });
    mockGetEnrolledCourses.mockResolvedValue([
      {
        id: 'c1',
        title: 'Organic Chemistry',
        description: 'Introduction to carbon-based molecules and reactions.',
        progressPercent: 50,
      },
      { id: 'c2', title: 'Lab Safety', description: null, progressPercent: 0 },
    ]);
  });

  it("greets the student and loads the student's courses", async () => {
    render(await StudentHomePage());

    expect(screen.getByRole('heading', { name: 'Welcome Student' })).toBeInTheDocument();
    expect(screen.getByText('My courses')).toBeInTheDocument();
    expect(mockGetEnrolledCourses).toHaveBeenCalledWith('student-1');
  });

  it("shows each course card with its progress, linked to that course's page", async () => {
    render(await StudentHomePage());

    const first = screen.getByRole('link', { name: /Organic Chemistry/ });
    expect(first).toHaveAttribute('href', '/student/courses/c1');
    expect(within(first).getByText('50%')).toBeInTheDocument();
    expect(within(first).getByText('In progress')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Lab Safety/ })).getByText('Not started')).toBeInTheDocument();
    expect(screen.queryByText(/not enrolled/)).not.toBeInTheDocument();
  });

  it('tells a student with no courses, and still shows the placeholder invite', async () => {
    mockGetEnrolledCourses.mockResolvedValue([]);
    render(await StudentHomePage());

    expect(screen.getByText(/not enrolled in any courses yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/student/coming-soon');
  });
});
