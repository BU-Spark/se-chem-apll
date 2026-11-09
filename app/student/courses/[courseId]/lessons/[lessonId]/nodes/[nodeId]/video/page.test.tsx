import { render } from '@testing-library/react';
import StudentNodeVideoPage from './page';

const mockGetStudentNode = jest.fn();
const mockQevLesson = jest.fn();

jest.mock('@/lib/auth/server', () => ({ requireStudent: async () => ({ id: 'student-1' }) }));
jest.mock('@/lib/studentNode', () => ({
  ...jest.requireActual('@/lib/studentNode'),
  getStudentNode: (...args: unknown[]) => mockGetStudentNode(...args),
}));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
jest.mock('@/app/components/QevLesson/QevLesson', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockQevLesson(props);
    return null;
  },
}));

const params = Promise.resolve({ courseId: 'c1', lessonId: 'cl1', nodeId: 'ln1' });
const timeline = [
  { kind: 'NOTE', id: 'n', at: 10, prompt: 'A note' },
  { kind: 'QUESTION', id: 'q', at: 20 },
];
const view = (screen: string) => ({
  screen,
  node: { title: 'Atoms' },
  video: { url: 'https://youtu.be/abc', muxPlaybackId: null },
  timeline,
  hasVideoQuestions: true,
  resumeAt: 42,
});
const renderVideoPage = async (screen: string, restart?: string) => {
  mockGetStudentNode.mockResolvedValue(view(screen));
  render(await StudentNodeVideoPage({ params, searchParams: Promise.resolve({ restart }) }));
  return mockQevLesson.mock.lastCall![0];
};

describe('StudentNodeVideoPage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resumes the video lesson where the student left, with its questions', async () => {
    expect(await renderVideoPage('REFRESH')).toMatchObject({
      timeline,
      resumeAt: 42,
      doneHref: '/student/courses/c1/lessons/cl1/nodes/ln1',
    });
  });

  it('after the answers are saved, resumes without asking the questions again', async () => {
    expect(await renderVideoPage('VIDEO_RESULT')).toMatchObject({ timeline: [timeline[0]], resumeAt: 42 });
  });

  it('starts over with the questions from Rewatch (?restart=1)', async () => {
    expect(await renderVideoPage('VIDEO_RESULT', '1')).toMatchObject({ timeline, resumeAt: 0 });
  });

  it('sends a node whose video cannot be watched now back to the node page', async () => {
    mockGetStudentNode.mockResolvedValue(view('QUIZ'));
    await expect(StudentNodeVideoPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT /student/courses/c1/lessons/cl1/nodes/ln1'
    );
  });
});
