import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckpointPlacement from '../CheckpointPlacement';
import { csvToCheckpoints, sampleCheckpointCsv } from '@/app/utils/checkpointCsv';
import type { YTPlayer } from '../YouTubeAuthoringPlayer';

jest.mock('../YouTubeAuthoringPlayer', () => ({
  __esModule: true,
  default: function Player({ onReady }: { onReady: (player: YTPlayer) => void }) {
    useEffect(() => {
      onReady({ getCurrentTime: () => 32.8, pauseVideo: jest.fn() } as unknown as YTPlayer);
    }, [onReady]);
    return <div>Video</div>;
  },
}));
function Harness({ video = true }: { video?: boolean }) {
  const [checkpoints, setCheckpoints] = useState(csvToCheckpoints(sampleCheckpointCsv()).checkpoints);
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
  it('assigns playback time to the selected group and keeps it selected', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Use current video time' }));
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
