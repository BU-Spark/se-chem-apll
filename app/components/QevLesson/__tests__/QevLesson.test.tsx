import { act, render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QevLesson from '../QevLesson';
import type { VideoControls } from '@/app/components/QevVideo/QevVideo';
import type { TimelineItem } from '@/lib/studentNode';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));
jest.mock('@/app/components/QuestionBank/MarkdownPreview', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

// A fake player whose time the test controls.
let time = 0;
// Real YouTube can say "ended" while still reporting an old time.
let youTubeSaysEnded = false;
const player: VideoControls = {
  currentTime: () => time,
  duration: () => 100,
  ended: () => youTubeSaysEnded,
  pause: jest.fn(),
  play: jest.fn(),
  seekTo: jest.fn(),
  setCaptions: jest.fn(),
  setSpeed: jest.fn(),
};
jest.mock('@/app/components/QevVideo/QevVideo', () => ({
  __esModule: true,
  // Keep the real end rules; only the player itself is faked.
  END_TOLERANCE_SECONDS: jest.requireActual('@/app/components/QevVideo/QevVideo').END_TOLERANCE_SECONDS,
  hasEnded: jest.requireActual('@/app/components/QevVideo/QevVideo').hasEnded,
  default: ({ onReady, startAt }: { onReady?: (c: VideoControls) => void; startAt?: number }) => {
    onReady?.(player);
    return <div>video from {startAt}</div>;
  },
}));

const question = (id: string, prompt: string, choices = ['A', 'B']) => ({ id, prompt, choices, allowsMultiple: false });
const asked = (id: string, at: number | null): TimelineItem => ({ kind: 'QUESTION', id, at });
const note = (id: string, at: number | null, prompt: string): TimelineItem => ({ kind: 'NOTE', id, at, prompt });

function mockApi(...bodies: unknown[]) {
  // Anything not queued below (like background progress saves) just succeeds.
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
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

function renderLesson(timeline: TimelineItem[], doneHref = '/node', resumeAt = 0) {
  return render(
    <QevLesson
      courseLessonId="cl-1"
      lessonNodeId="ln1"
      nodeTitle="Atoms"
      video={{ url: 'https://youtu.be/abc', muxPlaybackId: null }}
      timeline={timeline}
      resumeAt={resumeAt}
      lessonHref="/lesson"
      doneHref={doneHref}
    />
  );
}

const WAITING = /It pauses here for questions and notes/;

describe('QevLesson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    time = 0;
    youTubeSaysEnded = false;
    global.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000';
  });
  afterEach(() => jest.useRealTimers());

  it('pauses at a question, checks the answer, and keeps the video playing', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi(
      {
        id: 'attempt-1',
        questions: [question('late', 'Asked at the end', ['Yes', 'No']), question('early', 'Asked at 10 seconds')],
      },
      { correct: true },
      { correct: false },
      { id: 'attempt-1' }
    );
    renderLesson([asked('early', 10), asked('late', null)]);

    expect(sent(fetchMock, 0)).toEqual([
      '/api/student/assignments/cl-1',
      { action: 'start', nodeId: 'ln1', kind: 'CHECKPOINT', key: '00000000-0000-4000-8000-000000000000' },
    ]);
    expect(await screen.findByText(WAITING)).toBeInTheDocument();

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
          { questionId: 'late', selectedIndices: [1] },
          { questionId: 'early', selectedIndices: [0] },
        ],
      },
    ]);

    // The video is over, so the student can move on.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/node');
  });

  it('only lets the student move on once the video has ended', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockApi({ id: 'attempt-1', questions: [question('early', 'Asked at 10 seconds')] }, { correct: true }, {});
    renderLesson([asked('early', 10)]);
    await screen.findByText(WAITING);

    await advanceTo(10);
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Finish the video to continue/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();

    await advanceTo(99.5);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/node');
  });

  it('opens a question timed past the end of the video when the video ends', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockApi({ id: 'attempt-1', questions: [question('typo', 'Timed after the end')] }, { correct: true }, {});
    renderLesson([asked('typo', 500)]);
    await screen.findByText(WAITING);

    await advanceTo(99.5);
    expect(screen.getByText('Timed after the end')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Correct');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/node');
  });

  it('opens the end question when YouTube says ended but still reports an old time (dev skip to the end)', async () => {
    mockApi({ id: 'attempt-1', questions: [question('end', 'At the end')] });
    renderLesson([asked('end', null)]);
    await screen.findByText(WAITING);

    youTubeSaysEnded = true;
    await advanceTo(0.7);
    expect(screen.getByText('At the end')).toBeInTheDocument();
  });

  it('opens every end-of-video question in turn, without restarting the video', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi(
      { id: 'attempt-1', questions: [question('end1', 'First at the end'), question('end2', 'Second at the end')] },
      { correct: true },
      { correct: true },
      {}
    );
    renderLesson([asked('end1', null), asked('end2', null)]);
    await screen.findByText(WAITING);

    await advanceTo(99.8);
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Second at the end')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitForElementToBeRemoved(() => screen.queryByText('Second at the end'));
    expect(sent(fetchMock, 3)[1]).toMatchObject({ action: 'finish' });
    expect(player.play).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/node');
  });

  describe('notes', () => {
    it('pauses at a note, shows it, and resumes on Continue without checking or counting it', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const fetchMock = mockApi(
        { id: 'attempt-1', questions: [question('q', 'Asked at 30 seconds')] },
        { correct: true },
        {}
      );
      renderLesson([note('n', 10, 'Watch the **flame** color.'), asked('q', 30)]);
      await screen.findByText(WAITING);
      expect(screen.getByText('1/1 Questions')).toBeInTheDocument();

      await advanceTo(10);
      expect(player.pause).toHaveBeenCalled();
      expect(screen.getByRole('region', { name: 'Note' })).toHaveTextContent('Watch the **flame** color.');
      expect(screen.getByText('1/1 Questions')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(player.play).toHaveBeenCalled();
      expect(screen.queryByRole('region', { name: 'Note' })).not.toBeInTheDocument();

      // Only the question is checked and saved.
      await advanceTo(30);
      await user.click(screen.getByRole('radio', { name: /A/ }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByRole('status');
      // The attempt API gets only the question (progress saves are separate).
      const attemptCalls = fetchMock.mock.calls.filter(([url]) => !String(url).endsWith('/video-progress'));
      expect(attemptCalls).toHaveLength(3);
      expect(sent(fetchMock, 1)[1]).toEqual({
        attemptId: 'attempt-1',
        answer: { questionId: 'q', selectedIndices: [0] },
      });
      expect(sent(fetchMock, 2)[1]).toEqual({
        action: 'finish',
        attemptId: 'attempt-1',
        answers: [{ questionId: 'q', selectedIndices: [0] }],
      });
    });

    it("shows a note before a question at the same time, in the instructor's order", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockApi({ id: 'attempt-1', questions: [question('q', 'The question')] });
      renderLesson([note('n', 20, 'Read me first'), asked('q', 20)]);
      await screen.findByText(WAITING);

      await advanceTo(20);
      expect(screen.getByText('Read me first')).toBeInTheDocument();
      expect(screen.queryByText('The question')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await advanceTo(20);
      expect(screen.getByText('The question')).toBeInTheDocument();
    });

    it('shows notes on a video without questions, with no attempt, then continues to the next step', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const fetchMock = mockApi({ ok: true });
      renderLesson([note('n', 15, 'Only a note')], '/quiz');
      expect(screen.getByText(WAITING)).toBeInTheDocument();
      expect(screen.queryByText(/Questions$/)).not.toBeInTheDocument();

      await advanceTo(15);
      expect(screen.getByText('Only a note')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      await advanceTo(99.5);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(mockPush).toHaveBeenCalledWith('/quiz');
      // No attempt: the only call saves that the video was watched (and starts over next time).
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sent(fetchMock, 0)).toEqual([
        '/api/student/assignments/cl-1/video-progress',
        { nodeId: 'ln1', positionSeconds: 0, watched: true },
      ]);
    });
  });

  it('shows Continue after a video with no questions or notes once it ends, saving the watch once', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi({ ok: true });
    renderLesson([], '/quiz');
    expect(screen.getByText(/Finish the video to continue/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();

    await advanceTo(99.5);
    await advanceTo(99.9);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/quiz');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent(fetchMock, 0)).toEqual([
      '/api/student/assignments/cl-1/video-progress',
      { nodeId: 'ln1', positionSeconds: 0, watched: true },
    ]);
  });

  it('starts over next time once the answers are saved, without marking a video with questions watched', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi({ id: 'attempt-1', questions: [question('end', 'At the end')] }, { correct: true }, {});
    renderLesson([asked('end', null)]);
    await screen.findByText(WAITING);
    await advanceTo(99.5);
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('status');
    const progressSaves = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/video-progress'));
    expect(progressSaves.map(([, init]) => JSON.parse(init.body))).toEqual([
      { nodeId: 'ln1', positionSeconds: 0, watched: false },
    ]);
  });

  describe('resuming', () => {
    it('starts where the student left, re-asks earlier questions, and skips notes already passed', async () => {
      mockApi({ id: 'attempt-1', questions: [question('q', 'Asked at 20 seconds')] });
      renderLesson([note('n', 10, 'Seen before'), asked('q', 20)], '/node', 30);
      expect(await screen.findByText('video from 30')).toBeInTheDocument();
      await screen.findByText(WAITING);

      await advanceTo(30);
      expect(screen.getByText('Asked at 20 seconds')).toBeInTheDocument();
      expect(screen.queryByText('Seen before')).not.toBeInTheDocument();
    });

    it('saves how far the student got when they leave', async () => {
      const fetchMock = mockApi({ ok: true });
      const { unmount } = renderLesson([], '/quiz');
      await advanceTo(40);
      unmount();
      expect(sent(fetchMock, 0)).toEqual([
        '/api/student/assignments/cl-1/video-progress',
        { nodeId: 'ln1', positionSeconds: 40 },
      ]);
    });

    it('saves every few seconds while watching, only when the position moved', async () => {
      const fetchMock = mockApi();
      renderLesson([], '/quiz');
      await advanceTo(12);
      await act(async () => jest.advanceTimersByTime(5000));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sent(fetchMock, 0)[1]).toEqual({ nodeId: 'ln1', positionSeconds: 12 });

      // Paused at the same spot: nothing new to save.
      await act(async () => jest.advanceTimersByTime(5000));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
