import { render, screen } from '@testing-library/react';
import StudentCoursePage from './page';

const mockRequireStudent = jest.fn();
const mockGetStudentCourse = jest.fn();

jest.mock('@/lib/auth/server', () => ({ requireStudent: () => mockRequireStudent() }));
jest.mock('@/lib/studentCourses', () => ({
  ...jest.requireActual('@/lib/studentCourses'),
  getStudentCourse: (...args: unknown[]) => mockGetStudentCourse(...args),
}));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const params = Promise.resolve({ courseId: 'course-1' });

describe('StudentCoursePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireStudent.mockResolvedValue({ id: 'student-1' });
    mockGetStudentCourse.mockResolvedValue({
      id: 'course-1',
      title: 'Course #3',
      description: 'Introduction to carbon-based molecules.',
      lessons: [
        { id: 'a', number: 1, title: 'Atoms', status: 'COMPLETED' },
        { id: 'b', number: 2, title: 'Bonds', status: 'NOT_STARTED' },
      ],
    });
  });

  it('shows the course, its lessons, and marks the first unfinished lesson as current', async () => {
    render(await StudentCoursePage({ params }));

    expect(mockGetStudentCourse).toHaveBeenCalledWith('student-1', 'course-1');
    expect(screen.getByRole('heading', { name: 'Course #3' })).toBeInTheDocument();
    expect(screen.getByText('Introduction to carbon-based molecules.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take me to current lesson' })).toHaveAttribute(
      'href',
      '/student/courses/course-1/lessons/b'
    );
    expect(screen.getByRole('link', { name: /Lesson 1: Atoms/ })).toHaveAttribute(
      'href',
      '/student/courses/course-1/lessons/a'
    );
    expect(screen.getByRole('link', { name: /Lesson 2: Bonds/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: /Lesson 1: Atoms/ })).not.toHaveAttribute('aria-current');
  });

  it('shows the not-found page when the student is not enrolled', async () => {
    mockGetStudentCourse.mockResolvedValue(null);
    await expect(StudentCoursePage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('says so when the course has no lessons yet', async () => {
    mockGetStudentCourse.mockResolvedValue({ id: 'course-1', title: 'Course #3', description: null, lessons: [] });
    render(await StudentCoursePage({ params }));

    expect(screen.getByText('No lessons yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Take me to current lesson' })).not.toBeInTheDocument();
  });
});
