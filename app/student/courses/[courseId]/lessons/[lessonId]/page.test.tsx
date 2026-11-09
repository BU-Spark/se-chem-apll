import { render, screen, within } from '@testing-library/react';
import { studentLessonSubmission } from '@/lib/studentLessonSubmission';
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
const submission = studentLessonSubmission(
  {
    openDate: null,
    dueDate: new Date('2026-10-12T14:30:00Z'),
    lateDeadline: new Date('2026-10-14T14:30:00Z'),
    hideAfterDue: false,
    latePenaltyType: 'HOURLY',
    latePenaltyPercent: 2,
  },
  { finalPercent: null },
  new Date('2026-10-13T14:30:00Z')
);

describe('StudentLessonPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireStudent.mockResolvedValue({ id: 'student-1' });
    mockGetStudentLessonRoadmap.mockResolvedValue({
      courseTitle: 'Course #3',
      lessonTitle: 'Lesson 2',
      submission,
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [],
    });
  });

  it('shows the late policy and submission details in the roadmap header', async () => {
    render(await StudentLessonPage({ params }));

    const header = within(screen.getByRole('banner'));
    expect(header.getByText('Oct 12, 2026, 2:30 PM UTC')).toBeVisible();
    expect(header.getByText('Oct 14, 2026, 2:30 PM UTC')).toBeVisible();
    expect(header.getByText('Open for late submissions')).toBeVisible();
    expect(header.getByText(/2% of the earned score deducted per hour/)).toBeVisible();
    expect(header.getByText('Submitted')).toBeVisible();
    expect(header.getByText('Completion only')).toBeVisible();
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
    mockGetStudentLessonRoadmap.mockResolvedValue({
      courseTitle: 'C',
      lessonTitle: 'L',
      submission,
      nodes: [],
      edges: [],
    });
    render(await StudentLessonPage({ params }));
    expect(screen.getByText('This lesson has no nodes yet.')).toBeInTheDocument();
  });

  it('shows the not-found page when the student cannot see the lesson', async () => {
    mockGetStudentLessonRoadmap.mockResolvedValue(null);
    await expect(StudentLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
