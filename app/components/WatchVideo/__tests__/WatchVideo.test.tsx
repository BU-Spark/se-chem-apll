import { act, render, screen } from '@testing-library/react';
import WatchVideo from '../WatchVideo';

let endVideo: () => void = () => {};
jest.mock('@/app/components/QevVideo/QevVideo', () => ({
  __esModule: true,
  default: ({ onEnded }: { onEnded?: () => void }) => {
    endVideo = () => onEnded?.();
    return <div>video</div>;
  },
}));

const props = { nodeTitle: 'Atoms', lessonHref: '/lesson', quizHref: '/quiz' };

describe('WatchVideo', () => {
  it('shows Continue to the quiz only after the video ends', () => {
    render(<WatchVideo {...props} video={{ url: 'https://youtu.be/abc', muxPlaybackId: null }} />);

    expect(screen.getByRole('heading', { name: 'Atoms Video Lesson' })).toBeInTheDocument();
    expect(screen.getByText('Finish the video to continue.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue' })).not.toBeInTheDocument();

    act(() => endVideo());
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/quiz');
  });

  it('lets the student continue right away when the node has no video', () => {
    render(<WatchVideo {...props} video={{ url: null, muxPlaybackId: null }} />);
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/quiz');
  });
});
