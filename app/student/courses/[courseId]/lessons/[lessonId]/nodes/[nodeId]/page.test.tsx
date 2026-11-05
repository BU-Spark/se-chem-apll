import { render, screen } from '@testing-library/react';
import StudentNodePage from './page';

const mockRequireStudent = jest.fn();
const mockGetStudentNode = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});

jest.mock('@/lib/auth/server', () => ({ requireStudent: () => mockRequireStudent() }));
jest.mock('@/lib/studentNode', () => ({ getStudentNode: (...args: unknown[]) => mockGetStudentNode(...args) }));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
jest.mock('@/app/components/NodeQuiz/NodeQuiz', () => ({
  __esModule: true,
  default: ({ nodeTitle }: { nodeTitle: string }) => <div>quiz for {nodeTitle}</div>,
}));
jest.mock('@/app/components/NodeComplete/NodeComplete', () => ({
  __esModule: true,
  default: ({ correct, total }: { correct: number; total: number }) => (
    <div>
      complete {correct}/{total}
    </div>
  ),
}));
jest.mock('@/app/components/RefreshKnowledge/RefreshKnowledge', () => ({
  __esModule: true,
  default: ({ videoHref }: { videoHref: string }) => <div>refresh then {videoHref}</div>,
}));
jest.mock('@/app/components/KeepMovingForward/KeepMovingForward', () => ({
  __esModule: true,
  default: ({ retryHref }: { retryHref: string }) => <div>keep moving forward, retry {retryHref}</div>,
}));
jest.mock('@/app/components/NodeIncomplete/NodeIncomplete', () => ({
  __esModule: true,
  default: () => <div>node incomplete</div>,
}));
jest.mock('@/app/components/VideoResult/VideoResult', () => ({
  __esModule: true,
  default: ({ passed, quizHref }: { passed: boolean; quizHref: string }) => (
    <div>
      video {passed ? 'passed' : 'not passed'} then {quizHref}
    </div>
  ),
}));
jest.mock('@/app/components/NodeIntro/NodeIntro', () => ({
  __esModule: true,
  default: ({ videoHref }: { videoHref: string }) => <div>intro then {videoHref}</div>,
}));

const params = Promise.resolve({ courseId: 'c1', lessonId: 'cl1', nodeId: 'ln1' });
const view = (
  screenName: string,
  lastQuiz: { correct: number; total: number } | null = null,
  isFoundational = true
) => ({
  node: { id: 'ln1', title: 'Atoms', isFoundational, learningObjectives: [] },
  screen: screenName,
  lastQuiz,
  lastVideo: { correct: 4, total: 5, passed: true },
  coursePercent: 10,
});

describe('StudentNodePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireStudent.mockResolvedValue({ id: 'student-1' });
  });

  it.each([
    ['QUIZ', null, 'quiz for Atoms'],
    ['COMPLETE', { correct: 5, total: 5 }, 'complete 5/5'],
    ['REFRESH', { correct: 1, total: 5 }, 'refresh then /student/courses/c1/lessons/cl1/nodes/ln1/video'],
    ['VIDEO_RESULT', { correct: 1, total: 5 }, 'video passed then /student/courses/c1/lessons/cl1/nodes/ln1/quiz'],
    ['RETRY', { correct: 1, total: 5 }, 'keep moving forward, retry /student/courses/c1/lessons/cl1/nodes/ln1/video'],
    ['INCOMPLETE', { correct: 1, total: 5 }, 'node incomplete'],
  ])('shows the %s screen', async (screenName, lastQuiz, text) => {
    mockGetStudentNode.mockResolvedValue(view(screenName, lastQuiz));
    render(await StudentNodePage({ params }));
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(mockGetStudentNode).toHaveBeenCalledWith('student-1', 'c1', 'cl1', 'ln1');
  });

  it('starts a regular node with the intro, and retries its quiz without the video', async () => {
    mockGetStudentNode.mockResolvedValue(view('INTRO', null, false));
    render(await StudentNodePage({ params }));
    expect(screen.getByText('intro then /student/courses/c1/lessons/cl1/nodes/ln1/video')).toBeInTheDocument();

    mockGetStudentNode.mockResolvedValue(view('RETRY', { correct: 1, total: 5 }, false));
    render(await StudentNodePage({ params }));
    expect(
      screen.getByText('keep moving forward, retry /student/courses/c1/lessons/cl1/nodes/ln1/quiz')
    ).toBeInTheDocument();
  });

  it('sends a locked node back to the lesson map', async () => {
    mockGetStudentNode.mockResolvedValue(view('LOCKED'));
    await expect(StudentNodePage({ params })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/student/courses/c1/lessons/cl1');
  });

  it('shows the not-found page for a node the student cannot see', async () => {
    mockGetStudentNode.mockResolvedValue(null);
    await expect(StudentNodePage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
