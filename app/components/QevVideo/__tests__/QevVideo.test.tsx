import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QevVideo from '../QevVideo';

const mockPlayerVars = jest.fn();
let time = 0;
const ytPlayer = {
  getCurrentTime: () => time,
  getDuration: () => 120,
  pauseVideo: jest.fn(),
  playVideo: jest.fn(),
  seekTo: jest.fn(),
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

  it('shows progress that can only be watched, not dragged', async () => {
    jest.useFakeTimers();
    render(<QevVideo {...youTube} />);
    time = 30;
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    const bar = screen.getByRole('progressbar', { name: 'Video progress' });
    expect(bar).toHaveAttribute('aria-valuetext', '0:30 of 2:00');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    jest.useRealTimers();
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
});
