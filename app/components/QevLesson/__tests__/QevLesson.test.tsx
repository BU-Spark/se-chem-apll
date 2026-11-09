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

  it('saves the last answer early but waits for the video before requesting completion', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi(
      { id: 'attempt-1', questions: [questions[1]] },
      { correct: true, completedAt: null },
      { completedAt: '2026-11-01' }
    );
    renderLesson();
    await screen.findByText(/Questions will appear here/);
    await advanceTo(10);
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/All answers saved/)).toBeInTheDocument();
    expect(sent(fetchMock, 1)).toEqual([
      '/api/student/assignments/cl-1',
      {
        action: 'saveCheckpoint',
        attemptId: 'attempt-1',
        answer: { questionId: 'early', selectedIndices: [0] },
        videoEnded: false,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    await advanceTo(100);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(sent(fetchMock, 2)[1]).toEqual({ action: 'saveCheckpoint', attemptId: 'attempt-1', videoEnded: true });
    expect(mockPush).toHaveBeenCalledWith('/node');
  });

  it('restores saved answers after reload and retries a lost completion response', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi({
      id: 'attempt-1',
      questions: [questions[1]],
      draftAnswers: [{ questionId: 'early', selectedIndices: [0] }],
    });
    fetchMock.mockRejectedValueOnce(new Error('Connection lost'));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ completedAt: '2026-11-01' }) });
    renderLesson();
    expect(await screen.findByText(/All answers saved/)).toBeInTheDocument();
    await advanceTo(100);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(mockPush).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Retry completing video lesson' }));
    expect(sent(fetchMock, 1)).toEqual(sent(fetchMock, 2));
    expect(mockPush).toHaveBeenCalledWith('/node');
  });

  it('saves questions after the video ends and includes the end acknowledgement', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi(
      { id: 'attempt-1', questions: [questions[0]] },
      { correct: false, completedAt: '2026-11-01' }
    );
    renderLesson();
    await screen.findByText(/Questions will appear here/);
    await advanceTo(100);
    await user.click(screen.getByRole('radio', { name: /No/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Incorrect');
    expect(sent(fetchMock, 1)[1]).toMatchObject({ action: 'saveCheckpoint', videoEnded: true });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith('/node');
  });
});
