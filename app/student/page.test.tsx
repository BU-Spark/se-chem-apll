import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import StudentHomePage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const mockRequireStudent = jest.fn();
const mockGetEnrolledCourses = jest.fn();

jest.mock('@/lib/auth/server', () => ({ requireStudent: () => mockRequireStudent() }));
jest.mock('@/lib/studentCourses', () => ({
  getEnrolledCourses: (...args: unknown[]) => mockGetEnrolledCourses(...args),
}));

describe('StudentHomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireStudent.mockResolvedValue({
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

  it('lets a student with no courses join using a code', async () => {
    mockGetEnrolledCourses.mockResolvedValue([]);
    render(await StudentHomePage());

    expect(screen.getByText(/not enrolled in any courses yet/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Eight-letter code from your instructor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join course' })).toBeEnabled();
  });

  it('shows a rejected code and opens the course after a successful retry', async () => {
    const originalFetch = global.fetch;
    const request = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Check your code.' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ courseId: 'joined' }) });
    const router = { push: jest.fn(), refresh: jest.fn() };
    jest.mocked(useRouter).mockReturnValue(router as unknown as ReturnType<typeof useRouter>);
    global.fetch = request;
    try {
      const user = userEvent.setup();
      render(await StudentHomePage());
      const input = screen.getByRole('textbox', { name: 'Eight-letter code from your instructor' });
      const button = screen.getByRole('button', { name: 'Join course' });
      await user.type(input, 'aaaaaaaa');
      await user.click(button);
      expect(await screen.findByRole('alert')).toHaveTextContent('Check your code.');
      await user.clear(input);
      await user.type(input, 'abcdefgh');
      await user.click(button);

      expect(request).toHaveBeenLastCalledWith(
        '/api/student/courses/join',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: 'abcdefgh' }) })
      );
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/student/courses/joined'));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
