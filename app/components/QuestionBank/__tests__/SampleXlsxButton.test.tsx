import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SampleXlsxButton from '../SampleXlsxButton';
import { downloadSampleWorkbook } from '@/app/utils/sampleWorkbook';

jest.mock('@/app/utils/sampleWorkbook', () => ({ downloadSampleWorkbook: jest.fn() }));
const download = jest.mocked(downloadSampleWorkbook);
beforeEach(() => download.mockReset());

it.each(['checkpoints', 'quiz'] as const)('downloads the %s template and prevents duplicate requests', async (kind) => {
  let finish!: () => void;
  download.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  render(<SampleXlsxButton kind={kind} />);
  const button = screen.getByRole('button', { name: 'Download sample XLSX' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(download).toHaveBeenCalledTimes(1);
  expect(download).toHaveBeenCalledWith(kind);
  expect(screen.getByRole('button', { name: 'Preparing XLSX…' })).toBeDisabled();
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download sample XLSX' })).toBeEnabled());
});

it('reports a failed download and allows retry', async () => {
  download.mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(undefined);
  render(<SampleXlsxButton kind="quiz" />);
  fireEvent.click(screen.getByRole('button', { name: 'Download sample XLSX' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not download the Excel sample');
  fireEvent.click(screen.getByRole('button', { name: 'Download sample XLSX' }));
  await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
