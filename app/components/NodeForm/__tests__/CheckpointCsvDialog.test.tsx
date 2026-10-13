import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckpointCsvDialog from '../CheckpointCsvDialog';
import { csvToCheckpoints, sampleCheckpointCsv } from '@/app/utils/checkpointCsv';

function upload(text: string) {
  const file = new File([text], 'checkpoints.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => text });
  fireEvent.change(screen.getByLabelText('Choose checkpoint CSV file'), { target: { files: [file] } });
}

describe('checkpoint CSV review', () => {
  it('stages grouped content and requires an explicit apply', async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    render(<CheckpointCsvDialog existing={[]} onApply={onApply} onClose={onClose} />);
    upload(sampleCheckpointCsv());
    expect(await screen.findByText('2 checkpoints · 3 items · 1 need timestamps')).toBeInTheDocument();
    await userEvent.click(screen.getByText('intro'));
    expect(screen.getByText('After the introduction')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Import and assign timestamps' }));
    expect(onApply).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ checkpointKey: 'intro', timeOffsetSeconds: null, questions: expect.any(Array) }),
      ])
    );
    expect(onClose).toHaveBeenCalled();
  });
  it('keeps the filename visible, hides irrelevant modes, and permits selecting the same file again', async () => {
    render(<CheckpointCsvDialog existing={[]} onApply={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Choose CSV' })).toHaveFocus();
    upload(sampleCheckpointCsv());
    await screen.findByText('2 checkpoints · 3 items · 1 need timestamps');
    expect(screen.getByText('checkpoints.csv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change file' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText('No CSV selected')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Choose checkpoint CSV file')).toHaveValue('');
    upload(sampleCheckpointCsv());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import and assign timestamps' })).toBeEnabled());
  });

  it('blocks append collisions and requires replacement confirmation', async () => {
    const onApply = jest.fn();
    render(
      <CheckpointCsvDialog
        existing={csvToCheckpoints(sampleCheckpointCsv()).checkpoints}
        onApply={onApply}
        onClose={jest.fn()}
      />
    );
    upload(sampleCheckpointCsv());
    await screen.findByText(/already exists/);
    expect(screen.getByRole('button', { name: 'Import and assign timestamps' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Replace all checkpoints/ }));
    expect(screen.getByRole('button', { name: 'Import and assign timestamps' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Import and assign timestamps' }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });
  it('invalid uploads and cancellation leave existing content unchanged', async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    render(<CheckpointCsvDialog existing={[]} onApply={onApply} onClose={onClose} />);
    upload('wrong\nvalue');
    await screen.findByRole('list', { name: 'Import errors' });
    expect(screen.getByRole('button', { name: 'Import and assign timestamps' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('does not apply an older file after a newer selection', async () => {
    let resolve: (value: string) => void = () => {};
    const file = new File(['slow'], 'slow.csv');
    Object.defineProperty(file, 'text', {
      value: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    render(<CheckpointCsvDialog existing={[]} onApply={jest.fn()} onClose={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Choose checkpoint CSV file'), { target: { files: [file] } });
    upload('wrong\nvalue');
    await screen.findByRole('list', { name: 'Import errors' });
    resolve(sampleCheckpointCsv());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import and assign timestamps' })).toBeDisabled());
  });
});
