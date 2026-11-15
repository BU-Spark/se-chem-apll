import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QevVideo from '../QevVideo';

const mockPlayerVars = jest.fn();
let time = 0;
let state = -1;
const ytPlayer = {
  getCurrentTime: () => time,
  getDuration: () => 120,
  getPlayerState: () => state,
  pauseVideo: jest.fn(),
  playVideo: jest.fn(),
  seekTo: jest.fn(),
  setPlaybackRate: jest.fn(),
  loadModule: jest.fn(),
  unloadModule: jest.fn(),
  destroy: jest.fn(),
};
jest.mock('@/app/components/NodeForm/YouTubeAuthoringPlayer', () => ({
  __esModule: true,
  // Like the real player, report ready after mounting rather than while rendering.
  default: function FakeYouTube({ onReady, playerVars }: { onReady: (p: unknown) => void; playerVars: unknown }) {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    mockPlayerVars(playerVars);
    useEffect(() => onReady(ytPlayer), [onReady]);
    return <div>youtube</div>;
  },
}));

const youTube = { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', muxPlaybackId: null };

describe('QevVideo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    time = 0;
    state = -1;
  });

  it("hides YouTube's own controls and keyboard shortcuts so students can't skip", () => {
    render(<QevVideo {...youTube} />);
    expect(mockPlayerVars).toHaveBeenCalledWith(expect.objectContaining({ controls: 0, disablekb: 1 }));
  });

  it('plays and pauses with its own button', async () => {
    render(<QevVideo {...youTube} />);
    await userEvent.click(screen.getByRole('button', { name: 'Play video' }));
    expect(ytPlayer.playVideo).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Pause video' }));
    expect(ytPlayer.pauseVideo).toHaveBeenCalled();
  });

  it('cannot be played while a question is open', async () => {
    render(<QevVideo {...youTube} playLocked />);
    await screen.findByText('youtube');
    expect(screen.getByRole('button', { name: 'Play video' })).toBeDisabled();
  });

  // Plays the fake video up to `seconds`, so that becomes the furthest point watched.
  async function watchUntil(seconds: number) {
    time = seconds;
    await act(async () => jest.advanceTimersByTime(400));
  }

  describe('going back', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('drags back to anything watched, but never past the furthest point', async () => {
      render(<QevVideo {...youTube} />);
      await watchUntil(30);
      const bar = screen.getByRole('slider', { name: 'Video position' });
      expect(bar).toHaveAttribute('aria-valuetext', '0:30 of 2:00');

      fireEvent.change(bar, { target: { value: '10' } });
      expect(ytPlayer.seekTo).toHaveBeenLastCalledWith(10, true);
      fireEvent.change(bar, { target: { value: '90' } });
      expect(ytPlayer.seekTo).toHaveBeenLastCalledWith(30, true);
    });

    it('goes back 10 seconds, not before the start', async () => {
      render(<QevVideo {...youTube} />);
      await watchUntil(30);
      fireEvent.click(screen.getByRole('button', { name: 'Back 10 seconds' }));
      expect(ytPlayer.seekTo).toHaveBeenLastCalledWith(20, true);

      await watchUntil(4);
      fireEvent.click(screen.getByRole('button', { name: 'Back 10 seconds' }));
      expect(ytPlayer.seekTo).toHaveBeenLastCalledWith(0, true);
    });

    it("can't move while a question is open", async () => {
      render(<QevVideo {...youTube} playLocked />);
      await watchUntil(30);
      expect(screen.getByRole('slider', { name: 'Video position' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Back 10 seconds' })).toBeDisabled();
    });
  });

  it('starts where the student left, which counts as already watched', async () => {
    jest.useFakeTimers();
    render(<QevVideo {...youTube} startAt={30} />);
    await act(async () => jest.advanceTimersByTime(0));
    expect(ytPlayer.seekTo).toHaveBeenCalledWith(30, true);
    // ...and stays paused until the student presses Play.
    expect(ytPlayer.pauseVideo).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument();

    // Seeking back works from there, but not past it.
    time = 30;
    await act(async () => jest.advanceTimersByTime(400));
    const bar = screen.getByRole('slider', { name: 'Video position' });
    fireEvent.change(bar, { target: { value: '90' } });
    expect(ytPlayer.seekTo).toHaveBeenLastCalledWith(30, true);
    jest.useRealTimers();
  });

  it('slows down but never speeds up', async () => {
    render(<QevVideo {...youTube} />);
    const speed = await screen.findByRole('combobox', { name: 'Playback speed' });
    expect([...speed.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['1x', '0.75x', '0.5x']);
    await userEvent.selectOptions(speed, '0.5');
    expect(ytPlayer.setPlaybackRate).toHaveBeenCalledWith(0.5);
  });

  it('pauses when the student leaves the tab, until they press Play', async () => {
    let hidden = false;
    const hiddenSpy = jest.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    render(<QevVideo {...youTube} />);
    await userEvent.click(screen.getByRole('button', { name: 'Play video' }));

    hidden = true;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(ytPlayer.pauseVideo).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Paused while you were away');

    hidden = false;
    await userEvent.click(screen.getByRole('button', { name: 'Play video' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    hiddenSpy.mockRestore();
  });

  it('turns captions on and off', async () => {
    render(<QevVideo {...youTube} />);
    const cc = screen.getByRole('button', { name: 'Captions' });
    await userEvent.click(cc);
    expect(ytPlayer.loadModule).toHaveBeenCalledWith('captions');
    expect(cc).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(cc);
    expect(ytPlayer.unloadModule).toHaveBeenCalledWith('captions');
  });

  it("counts YouTube's ended state even when it still reports an old time", async () => {
    jest.useFakeTimers();
    const onEnded = jest.fn();
    render(<QevVideo {...youTube} onEnded={onEnded} />);
    time = 0.7;
    state = 0;
    await act(async () => jest.advanceTimersByTime(400));
    expect(onEnded).toHaveBeenCalled();
    expect(screen.getByRole('slider', { name: 'Video position' })).toHaveAttribute('aria-valuetext', '2:00 of 2:00');
    jest.useRealTimers();
  });

  it('tells the page once the video reaches its end', async () => {
    jest.useFakeTimers();
    const onEnded = jest.fn();
    render(<QevVideo {...youTube} onEnded={onEnded} />);
    await act(async () => jest.advanceTimersByTime(400));
    expect(onEnded).not.toHaveBeenCalled();

    // Half a second before the end (where the dev skip lands) already counts, even while paused.
    time = 119.5;
    await act(async () => jest.advanceTimersByTime(400));
    expect(onEnded).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('tells the page only once, even with a new callback or after rewatching the end', async () => {
    jest.useFakeTimers();
    const onEnded = jest.fn();
    const { rerender } = render(<QevVideo {...youTube} onEnded={() => onEnded()} />);
    time = 120;
    await act(async () => jest.advanceTimersByTime(400));
    rerender(<QevVideo {...youTube} onEnded={() => onEnded()} />);

    // Go back, then watch to the end again.
    time = 60;
    await act(async () => jest.advanceTimersByTime(400));
    time = 120;
    await act(async () => jest.advanceTimersByTime(400));
    expect(onEnded).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
