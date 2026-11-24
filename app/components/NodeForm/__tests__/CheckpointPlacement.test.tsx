import { useEffect, useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckpointPlacement from '../CheckpointPlacement';
import { csvToCheckpoints, sampleCheckpointCsv } from '@/app/utils/checkpointCsv';
import type { YTPlayer } from '../YouTubeAuthoringPlayer';

const mockPlayer = {
  getCurrentTime: () => 32.8,
  getDuration: jest.fn(),
  pauseVideo: jest.fn(),
  seekTo: jest.fn(),
};
let mockReady: () => void;
let mockDelayReady: boolean;

jest.mock('../YouTubeAuthoringPlayer', () => ({
  __esModule: true,
  default: function Player({ onReady }: { onReady: (player: YTPlayer) => void }) {
    useEffect(() => {
      mockReady = () => onReady(mockPlayer as unknown as YTPlayer);
      if (!mockDelayReady) mockReady();
    }, [onReady]);
    return <div>Video</div>;
  },
}));
function Harness({ video = true, csv = sampleCheckpointCsv() }: { video?: boolean; csv?: string }) {
  const [checkpoints, setCheckpoints] = useState(() => csvToCheckpoints(csv).checkpoints);
  return (
    <CheckpointPlacement
      checkpoints={checkpoints}
      videoId={video ? 'video' : null}
      onChange={setCheckpoints}
      onSaveDraft={jest.fn()}
    />
  );
}
describe('checkpoint placement screen', () => {
  beforeEach(() => {
    mockDelayReady = false;
    mockPlayer.getDuration.mockReset().mockReturnValue(300);
    mockPlayer.seekTo.mockReset();
    mockPlayer.pauseVideo.mockClear();
  });

  it('seeks on initial selection and when navigating between imported times, including zero', async () => {
    const csv = sampleCheckpointCsv()
      .replace('intro,1,1,,', 'intro,1,1,0,')
      .replace('forces,2,1,120,', 'forces,2,1,155,');
    render(<Harness csv={csv} />);
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0, true);
    await userEvent.click(screen.getByText('forces'));
    expect(screen.getByLabelText('Time (mm:ss)')).toHaveValue('2:35');
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(155, true);

    await userEvent.clear(screen.getByLabelText('Time (mm:ss)'));
    await userEvent.type(screen.getByLabelText('Time (mm:ss)'), '2:36');
    expect(mockPlayer.seekTo).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Assign time' }));
    await userEvent.click(screen.getByText('intro'));
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0, true);
    await userEvent.click(screen.getByText('forces'));
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(156, true);
    expect(mockPlayer.pauseVideo).not.toHaveBeenCalled();
  });

  it('uses the latest selection when the player is ready and leaves untimed groups alone', async () => {
    mockDelayReady = true;
    render(<Harness />);
    await userEvent.click(screen.getByText('forces'));
    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
    act(() => mockReady());
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(120, true);
    await userEvent.click(screen.getByRole('button', { name: 'Next unassigned group' }));
    expect(screen.getByLabelText('Time (mm:ss)')).toHaveValue('');
    expect(mockPlayer.seekTo).toHaveBeenCalledTimes(1);
  });

  it('preserves an out-of-range time for correction without seeking to it', async () => {
    mockPlayer.getDuration.mockReturnValue(90);
    render(<Harness />);
    await userEvent.click(screen.getByText('forces'));
    expect(screen.getByLabelText('Time (mm:ss)')).toHaveValue('2:00');
    expect(screen.getByRole('alert')).toHaveTextContent('past the end of the video');
    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Time (mm:ss)'));
    await userEvent.type(screen.getByLabelText('Time (mm:ss)'), '1:00{Enter}');
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(60, true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('checks the range again when duration loads without seeking twice', async () => {
    mockPlayer.getDuration.mockReturnValue(0);
    render(<Harness />);
    await userEvent.click(screen.getByText('forces'));
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(120, true);
    mockPlayer.getDuration.mockReturnValue(90);
    expect(await screen.findByRole('alert')).toHaveTextContent('past the end of the video');
    expect(mockPlayer.seekTo).toHaveBeenCalledTimes(1);
  });

  it('keeps manual controls usable if the seek fails', async () => {
    mockPlayer.seekTo.mockImplementationOnce(() => {
      throw new Error('Player unavailable');
    });
    render(<Harness />);
    await userEvent.click(screen.getByText('forces'));
    expect(screen.getByRole('alert')).toHaveTextContent('could not jump');
    await userEvent.click(screen.getByRole('button', { name: 'Clear time' }));
    expect(screen.getByLabelText('Time (mm:ss)')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('assigns playback time to the selected group and keeps it selected', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Use current video time' }));
    expect(mockPlayer.pauseVideo).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 of 2 groups assigned')).toBeInTheDocument();
    expect(screen.getByLabelText('Time (mm:ss)')).toHaveValue('0:32');
    expect(screen.getByText('intro').closest('details')).toHaveAttribute('open');
  });
  it('reports collisions and malformed times beside the selected group', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Time (mm:ss)'), '2:00');
    await userEvent.click(screen.getByRole('button', { name: 'Assign time' }));
    expect(screen.getByRole('alert')).toHaveTextContent('already assigned to forces');
    await userEvent.clear(screen.getByLabelText('Time (mm:ss)'));
    await userEvent.type(screen.getByLabelText('Time (mm:ss)'), '2:99');
    await userEvent.click(screen.getByRole('button', { name: 'Assign time' }));
    expect(screen.getByRole('alert')).toHaveTextContent('minutes:seconds');
    expect(screen.getByText('1 of 2 groups assigned')).toBeInTheDocument();
  });
  it('supports manual assignment without a video and clearing an assignment', async () => {
    render(<Harness video={false} />);
    expect(screen.getByText('Add a video to place groups during playback')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Time (mm:ss)'), '0:00');
    await userEvent.click(screen.getByRole('button', { name: 'Assign time' }));
    expect(screen.getByText('All groups assigned')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear time' }));
    expect(screen.getByText('1 of 2 groups assigned')).toBeInTheDocument();
  });
});
