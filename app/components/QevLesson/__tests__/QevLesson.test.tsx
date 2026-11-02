import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QevLesson from '../QevLesson';
import type { VideoControls } from '@/app/components/QevVideo/QevVideo';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));
jest.mock('@/app/components/QuestionBank/MarkdownPreview', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

// A fake player whose time the test controls.
let time = 0;
const player: VideoControls = {
  currentTime: () => time,
  duration: () => 100,
  pause: jest.fn(),
  play: jest.fn(),
  seekTo: jest.fn(),
  setCaptions: jest.fn(),
};
jest.mock('@/app/components/QevVideo/QevVideo', () => ({
  __esModule: true,
  END_TOLERANCE_SECONDS: 1,
  default: ({ onReady }: { onReady?: (c: VideoControls) => void }) => {
    onReady?.(player);
    return <div>video</div>;
  },
}));

const questions = [
  { id: 'late', prompt: 'Asked at the end', choices: ['Yes', 'No'] },
  { id: 'early', prompt: 'Asked at 10 seconds', choices: ['A', 'B'] },
];

function mockApi(...bodies: unknown[]) {
  const fetchMock = jest.fn();
  for (const body of bodies) fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body });
  global.fetch = fetchMock as never;
  return fetchMock;
}
const sent = (fetchMock: jest.Mock, call: number) => [
  fetchMock.mock.calls[call][0],
  JSON.parse(fetchMock.mock.calls[call][1].body),
];

async function advanceTo(seconds: number) {
  time = seconds;
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

function renderLesson() {
  return render(
    <QevLesson
      courseLessonId="cl-1"
      lessonNodeId="ln1"
      nodeTitle="Atoms"
      video={{ url: 'https://youtu.be/abc', muxPlaybackId: null }}
      questionTimes={{ early: 10, late: null }}
      lessonHref="/lesson"
      doneHref="/node"
    />
  );
}

describe('QevLesson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    time = 0;
    global.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000';
  });
  afterEach(() => jest.useRealTimers());

  it('pauses at a question, checks the answer, and keeps the video playing', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi(
      { id: 'attempt-1', questions },
      { correct: true },
      { correct: false },
      { id: 'attempt-1' }
    );
    renderLesson();

    expect(sent(fetchMock, 0)).toEqual([
      '/api/student/assignments/cl-1',
      { action: 'start', nodeId: 'ln1', kind: 'CHECKPOINT', key: '00000000-0000-4000-8000-000000000000' },
    ]);
    expect(await screen.findByText(/Questions will appear here/)).toBeInTheDocument();

    // The timed question opens when the video reaches 10 seconds.
    await advanceTo(5);
    expect(screen.queryByText('Asked at 10 seconds')).not.toBeInTheDocument();
    await advanceTo(10);
    expect(player.pause).toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(sent(fetchMock, 1)).toEqual([
      '/api/student/assignments/cl-1/check',
      { attemptId: 'attempt-1', answer: { questionId: 'early', selectedIndices: [0] } },
    ]);
    // Feedback shows and the video resumes on its own: no second click.
    expect(await screen.findByRole('status')).toHaveTextContent('Correct');
    expect(player.play).toHaveBeenCalled();
    expect(screen.queryByText('Asked at 10 seconds')).not.toBeInTheDocument();

    // The untimed question opens when the video ends; answering it saves everything.
    await advanceTo(99.8);
    await user.click(screen.getByRole('radio', { name: /No/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Incorrect');
    expect(sent(fetchMock, 3)).toEqual([
      '/api/student/assignments/cl-1',
      {
        action: 'finish',
        attemptId: 'attempt-1',
        answers: [
          { questionId: 'early', selectedIndices: [0] },
          { questionId: 'late', selectedIndices: [1] },
        ],
      },
    ]);

    // The video is over, so the student can move on.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/node');
  });

  it('only lets the student move on once the video has ended', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockApi({ id: 'attempt-1', questions: [questions[1]] }, { correct: true }, { id: 'attempt-1' });
    renderLesson();
    await screen.findByText(/Questions will appear here/);

    await advanceTo(10);
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Finish the video to continue/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();

    await advanceTo(99.5);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/node');
  });

  it('opens a question timed past the end of the video when the video ends', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockApi(
      { id: 'attempt-1', questions: [{ id: 'typo', prompt: 'Timed after the end', choices: ['A', 'B'] }] },
      { correct: true },
      { id: 'attempt-1' }
    );
    render(
      <QevLesson
        courseLessonId="cl-1"
        lessonNodeId="ln1"
        nodeTitle="Atoms"
        video={{ url: 'https://youtu.be/abc', muxPlaybackId: null }}
        questionTimes={{ typo: 500 }}
        lessonHref="/lesson"
        doneHref="/node"
      />
    );
    await screen.findByText(/Questions will appear here/);

    await advanceTo(99.5);
    expect(screen.getByText('Timed after the end')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Correct');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/node');
  });
});
