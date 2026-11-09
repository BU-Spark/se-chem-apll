import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WatchVideo from '../WatchVideo';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));

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

it('records review completion and requests automatic submission before navigating', async () => {
  global.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000';
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'review-1' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'review-1' }) });
  global.fetch = fetchMock;
  render(
    <WatchVideo
      {...props}
      video={{ url: null, muxPlaybackId: null }}
      review={{ courseLessonId: 'cl', lessonNodeId: 'ln', doneHref: '/done' }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/done'));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: 'start', kind: 'REVIEW', nodeId: 'ln' });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    action: 'finish',
    attemptId: 'review-1',
    answers: [],
    submitWhenReady: true,
    videoEnded: true,
  });
});
