import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QevLesson from '../QevLesson';
import type { VideoControls } from '@/app/components/QevVideo/QevVideo';
import type { TimelineItem } from '@/lib/studentNode';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));
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

// Attempt API calls get the queued replies in order; background progress saves just succeed.
const isProgressSave = (url: unknown) => String(url).endsWith('/video-progress');
function mockApi(...bodies: unknown[]) {
  const replies = [...bodies];
  const fetchMock = jest.fn(async (url: string) => ({
    ok: true,
    json: async () => (isProgressSave(url) ? {} : (replies.shift() ?? {})),
  }));
  global.fetch = fetchMock as never;
  return fetchMock;
}
const attemptCalls = (fetchMock: jest.Mock) => fetchMock.mock.calls.filter(([url]) => !isProgressSave(url));
const progressSaves = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls.filter(([url]) => isProgressSave(url)).map(([, init]) => JSON.parse(init.body));
// The nth attempt API call: [url, body].
const sent = (fetchMock: jest.Mock, call: number) => {
  const [url, init] = attemptCalls(fetchMock)[call];
  return [url, JSON.parse(init.body)];
};

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

  it('keeps the video paused with formatted feedback until Continue', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi(
      {
        id: 'attempt-1',
        questions: [question('late', 'Asked at the end', ['Yes', 'No']), question('early', 'Asked at 10 seconds')],
      },
      { correct: true, feedback: String.raw`**Water** is $\ce{H2O}$. Its molar mass is $18\,\mathrm{g/mol}$.` },
      { correct: false, feedback: null },
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
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(sent(fetchMock, 1)).toEqual([
      '/api/student/assignments/cl-1/check',
      { attemptId: 'attempt-1', answer: { questionId: 'early', selectedIndices: [0] } },
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('Correct');
    const water = screen.getByText('Water', { selector: 'strong' });
    expect(water.closest('p')?.querySelectorAll('.katex')).toHaveLength(2);
    expect(player.play).not.toHaveBeenCalled();
    expect(screen.getByText('Asked at 10 seconds')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /B/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('Water')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(player.play).toHaveBeenCalled();
    expect(screen.queryByText('Asked at 10 seconds')).not.toBeInTheDocument();

    // The untimed question opens when the video ends; answering it saves everything.
    await advanceTo(99.8);
    await user.click(screen.getByRole('radio', { name: /No/ }));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Incorrect');
    expect(screen.getAllByTestId('markdown-preview')).toHaveLength(3); // Prompt and two choices.
    expect(attemptCalls(fetchMock)).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
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
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Finish the video to continue/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();

    await advanceTo(99.5);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/node');
  });

  it('retries a failed final save with the same locked answer and feedback', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi(
      { id: 'attempt-1', questions: [question('q', 'At 10 seconds')] },
      { correct: false, feedback: 'Check the units.' },
      {}
    );
    renderLesson([asked('q', 10)]);
    await screen.findByText(WAITING);
    await advanceTo(10);
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Incorrect');

    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unable to save.' }) });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save.');
    expect(screen.getByText('Check the units.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /B/ })).toBeDisabled();
    expect(player.play).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(sent(fetchMock, 3)).toEqual(sent(fetchMock, 2));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('opens a question timed past the end of the video when the video ends', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockApi({ id: 'attempt-1', questions: [question('typo', 'Timed after the end')] }, { correct: true }, {});
    renderLesson([asked('typo', 500)]);
    await screen.findByText(WAITING);

    await advanceTo(99.5);
    expect(screen.getByText('Timed after the end')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Correct');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
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
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Second at the end')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));

    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByText('Second at the end')).not.toBeInTheDocument());
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
      expect(
        within(screen.getByRole('region', { name: 'Note' })).getByText('flame', { selector: 'strong' })
      ).toBeInTheDocument();
      expect(screen.getByText('1/1 Questions')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(player.play).toHaveBeenCalled();
      expect(screen.queryByRole('region', { name: 'Note' })).not.toBeInTheDocument();

      // Only the question is checked and saved.
      await advanceTo(30);
      await user.click(screen.getByRole('radio', { name: /A/ }));
      await user.click(screen.getByRole('button', { name: 'Check answer' }));
      await screen.findByRole('status');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      // The attempt API gets only the question.
      expect(attemptCalls(fetchMock)).toHaveLength(3);
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
      // No attempt: the only save records the end and that the video was watched.
      expect(attemptCalls(fetchMock)).toHaveLength(0);
      expect(progressSaves(fetchMock)).toEqual([{ nodeId: 'ln1', positionSeconds: 100, watched: true }]);
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
    expect(progressSaves(fetchMock)).toEqual([{ nodeId: 'ln1', positionSeconds: 100, watched: true }]);
  });

  it('saves the end of the video right away, without marking a video with questions watched', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = mockApi({ id: 'attempt-1', questions: [question('end', 'At the end')] }, { correct: true }, {});
    renderLesson([asked('end', null)]);
    await screen.findByText(WAITING);
    await advanceTo(99.5);
    await user.click(screen.getByRole('radio', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await screen.findByRole('status');
    expect(progressSaves(fetchMock)).toEqual([{ nodeId: 'ln1', positionSeconds: 100, watched: false }]);
  });

  describe('resuming', () => {
    it('starts where the student left, re-asks earlier questions, and skips notes already passed', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const fetchMock = mockApi(
        { id: 'attempt-1', questions: [question('q', 'Asked at 20 seconds')] },
        { correct: true },
        {}
      );
      renderLesson([note('n', 10, 'Seen before'), asked('q', 20)], '/node', 30);
      expect(await screen.findByText('video from 30')).toBeInTheDocument();
      await screen.findByText(WAITING);

      await advanceTo(30);
      expect(screen.getByText('Asked at 20 seconds')).toBeInTheDocument();
      expect(screen.queryByText('Seen before')).not.toBeInTheDocument();

      // The re-asked question can be answered, the attempt saves, and the student moves on.
      await user.click(screen.getByRole('radio', { name: /A/ }));
      await user.click(screen.getByRole('button', { name: 'Check answer' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Correct');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByText(/Finish the video to continue/);
      expect(sent(fetchMock, 2)).toEqual([
        '/api/student/assignments/cl-1',
        { action: 'finish', attemptId: 'attempt-1', answers: [{ questionId: 'q', selectedIndices: [0] }] },
      ]);
      await advanceTo(99.5);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(mockPush).toHaveBeenCalledWith('/node');
    });

    it('keeps working when progress saves fail', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      // Progress saves fail (an error reply, then a network error); the attempt API works.
      let failures = 0;
      global.fetch = jest.fn(async (url: string) => {
        if (!isProgressSave(url)) return { ok: true, json: async () => ({}) };
        if (failures++ % 2) throw new TypeError('Failed to fetch');
        return { ok: false, json: async () => ({ error: 'Server error' }) };
      }) as never;
      renderLesson([], '/quiz');

      await advanceTo(12);
      await act(async () => jest.advanceTimersByTime(5000));
      await advanceTo(99.5);
      expect(failures).toBeGreaterThanOrEqual(2);
      // No error for the student, and they can still move on.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(mockPush).toHaveBeenCalledWith('/quiz');
    });

    it('keeps the position until the video ends, even after the answers are saved', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const fetchMock = mockApi(
        { id: 'attempt-1', questions: [question('q', 'At 10 seconds')] },
        { correct: true },
        {}
      );
      const { unmount } = renderLesson([asked('q', 10)]);
      await screen.findByText(WAITING);
      await advanceTo(10);
      await user.click(screen.getByRole('radio', { name: /A/ }));
      await user.click(screen.getByRole('button', { name: 'Check answer' }));
      await screen.findByRole('status');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByText(/Finish the video to continue/);

      // Leaving mid-video saves where they are, not a reset to 0.
      await advanceTo(30);
      unmount();
      expect(progressSaves(fetchMock)).toEqual([{ nodeId: 'ln1', positionSeconds: 30 }]);
    });

    it('after finishing, a refresh comes back at the end with Continue, not from the start', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockApi();
      // Answers already saved, so the page passes no questions; the saved spot is the end.
      renderLesson([], '/node', 100);
      expect(screen.getByText('video from 100')).toBeInTheDocument();
      await advanceTo(100);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(mockPush).toHaveBeenCalledWith('/node');
    });

    it('saves how far the student got when they leave', async () => {
      const fetchMock = mockApi({ ok: true });
      const { unmount } = renderLesson([], '/quiz');
      await advanceTo(40);
      unmount();
      expect(progressSaves(fetchMock)).toEqual([{ nodeId: 'ln1', positionSeconds: 40 }]);
    });

    it('saves every few seconds while watching, only when the position moved', async () => {
      const fetchMock = mockApi();
      renderLesson([], '/quiz');
      await advanceTo(12);
      await act(async () => jest.advanceTimersByTime(5000));
      expect(progressSaves(fetchMock)).toEqual([{ nodeId: 'ln1', positionSeconds: 12 }]);

      // Paused at the same spot: nothing new to save.
      await act(async () => jest.advanceTimersByTime(5000));
      expect(progressSaves(fetchMock)).toHaveLength(1);
    });
  });
});
