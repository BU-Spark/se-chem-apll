import { render, screen } from '@testing-library/react';
import StudentLessonPage from './page';

const mockRequireStudent = jest.fn();
const mockGetStudentLessonRoadmap = jest.fn();

jest.mock('@/lib/auth/server', () => ({ requireStudent: () => mockRequireStudent() }));
jest.mock('@/lib/studentLessonRoadmap', () => ({
  getStudentLessonRoadmap: (...args: unknown[]) => mockGetStudentLessonRoadmap(...args),
}));
jest.mock('@/app/components/LessonRoadmap/LessonRoadmap', () => ({
  __esModule: true,
  default: ({ nodes }: { nodes: unknown[] }) => <div data-testid="roadmap">{nodes.length} nodes</div>,
}));
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const params = Promise.resolve({ courseId: 'course-1', lessonId: 'cl-1' });

describe('StudentLessonPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireStudent.mockResolvedValue({ id: 'student-1' });
    mockGetStudentLessonRoadmap.mockResolvedValue({
      courseTitle: 'Course #3',
      lessonTitle: 'Lesson 2',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [],
    });
  });

  it('shows the lesson title, the course, a back link, and the roadmap', async () => {
    render(await StudentLessonPage({ params }));

    expect(mockGetStudentLessonRoadmap).toHaveBeenCalledWith('student-1', 'course-1', 'cl-1');
    expect(screen.getByRole('heading', { name: 'Lesson 2' })).toBeInTheDocument();
    expect(screen.getByText('Course #3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Course #3' })).toHaveAttribute(
      'href',
      '/student/courses/course-1'
    );
    expect(screen.getByTestId('roadmap')).toHaveTextContent('2 nodes');
  });

  it('says so when the lesson has no nodes', async () => {
    mockGetStudentLessonRoadmap.mockResolvedValue({ courseTitle: 'C', lessonTitle: 'L', nodes: [], edges: [] });
    render(await StudentLessonPage({ params }));
    expect(screen.getByText('This lesson has no nodes yet.')).toBeInTheDocument();
  });

  it('shows the not-found page when the student cannot see the lesson', async () => {
    mockGetStudentLessonRoadmap.mockResolvedValue(null);
    await expect(StudentLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
