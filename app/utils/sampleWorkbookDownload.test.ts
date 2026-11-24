import { waitFor } from '@testing-library/react';
import { downloadSampleWorkbook } from './sampleWorkbook';

jest.mock('exceljs', () => jest.requireActual('exceljs/dist/exceljs.min.js'));

it.each([
  ['checkpoints', 'checkpoints-sample.xlsx'],
  ['quiz', 'quiz-questions-sample.xlsx'],
] as const)('downloads the %s workbook with the right filename and MIME type', async (kind, filename) => {
  const create = jest.fn<string, [Blob]>(() => 'blob:sample');
  const revoke = jest.fn();
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe(filename);
    expect(this.href).toBe('blob:sample');
  });
  try {
    await downloadSampleWorkbook(kind);
    expect(click).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect((create.mock.calls[0][0] as Blob).type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect((create.mock.calls[0][0] as Blob).size).toBeGreaterThan(0);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:sample'));
  } finally {
    click.mockRestore();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
