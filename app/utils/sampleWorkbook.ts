import type { RichText } from 'exceljs';
import { sampleCheckpointRows } from './checkpointCsv';
import { SAMPLE_QUESTION_BANK_HEADERS, SAMPLE_QUESTION_BANK_CSV_ROWS } from './questionBankCsv';

export type SampleWorkbookKind = 'checkpoints' | 'quiz';

const sub = (text: string): RichText => ({ text, font: { vertAlign: 'subscript' } });
const sup = (text: string): RichText => ({ text, font: { vertAlign: 'superscript' } });

/** Generate authoring templates, with strings/Text columns to prevent Excel coercion. */
export async function createSampleWorkbook(kind: SampleWorkbookKind): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(kind === 'checkpoints' ? 'Checkpoints' : 'Quiz questions');
  const rows =
    kind === 'checkpoints'
      ? sampleCheckpointRows()
      : [[...SAMPLE_QUESTION_BANK_HEADERS], ...SAMPLE_QUESTION_BANK_CSV_ROWS.map((row) => [...row])];
  const headers = rows[0];
  sheet.columns = headers.map((header) => ({
    width: header === 'prompt' ? 65 : /^(choice_|feedback_|var:)/.test(header) ? 30 : 22,
    style: { numFmt: '@', alignment: { vertical: 'top', wrapText: true } },
  }));
  rows.forEach((row) => sheet.addRow(row));
  const cell = (row: number, header: string) => sheet.getCell(row, headers.indexOf(header) + 1);
  // Teach Excel formatting directly, without requiring authors to write HTML.
  cell(2, 'prompt').value = {
    richText: [
      { text: 'Select water and sulfate: H' },
      sub('2'),
      { text: 'O, SO' },
      sub('4'),
      sup('2−'),
      { text: ', and Fe' },
      sup('3+'),
      { text: '. Reaction: 2H' },
      sub('2'),
      { text: ' + O' },
      sub('2'),
      { text: ' → 2H' },
      sub('2'),
      { text: 'O. Math also works: $x^2$ and $\\ce{H2O}$.' },
    ],
  };
  cell(2, 'choice_1').value = { richText: [{ text: 'H' }, sub('2'), { text: 'O' }] };
  cell(2, 'choice_2').value = { richText: [{ text: 'SO' }, sub('4'), sup('2−')] };
  cell(2, 'choice_3').value = { richText: [{ text: 'Fe' }, sup('3+')] };
  cell(2, 'choice_4').value = '';
  cell(2, 'correct').value = '1,2';
  cell(2, 'feedback_correct').value = 'Correct! Water and sulfate are the first two choices.';
  cell(2, 'feedback_incorrect').value = 'Select both water and sulfate.';
  if (kind === 'checkpoints') {
    cell(4, 'prompt').value = {
      richText: [
        { text: 'Example concentration: 10' },
        sup('−3'),
        { text: ' mol/L. Apply Excel subscript or superscript to selected characters.' },
      ],
    };
  }
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.height = 32;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length, column: headers.length } };
  // ExcelJS's Buffer declaration represents ArrayBuffer; normalize the browser
  // bundle's Uint8Array output into an owned ArrayBuffer for Blob/download APIs.
  return new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer).buffer;
}

export async function downloadSampleWorkbook(kind: SampleWorkbookKind): Promise<void> {
  const buffer = await createSampleWorkbook(kind);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = kind === 'checkpoints' ? 'checkpoints-sample.xlsx' : 'quiz-questions-sample.xlsx';
  try {
    anchor.click();
  } finally {
    // Let the browser start reading the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
