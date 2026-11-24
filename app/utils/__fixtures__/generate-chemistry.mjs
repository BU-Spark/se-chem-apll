// Regenerate with: node app/utils/__fixtures__/generate-chemistry.mjs
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
(async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Chemistry');
  const headers = [
    'question_key',
    'variant_key',
    'type',
    'prompt',
    ...Array.from({ length: 8 }, (_, i) => `choice_${i + 1}`),
    'correct',
    'answer_mode',
    'expected_answer',
    'minimum_answer',
    'maximum_answer',
    'feedback_correct',
    'feedback_incorrect',
  ];
  sheet.addRow(headers);
  const sub = (text) => ({ text, font: { vertAlign: 'subscript' } });
  const sup = (text) => ({ text, font: { vertAlign: 'superscript' } });
  sheet.addRow([
    'water',
    '',
    'multipleChoice',
    {
      richText: [
        { text: '2H', font: { bold: true } },
        sub('2'),
        { text: ' + O' },
        sub('2'),
        { text: ' → 2H' },
        sub('2'),
        { text: 'O; SO' },
        sub('4'),
        sup('2'),
        { text: '−', font: { vertAlign: 'superscript', bold: true } },
        { text: '; Fe' },
        sup('3+'),
        { text: '; 10' },
        sup('−3'),
        { text: '; $\\ce{H2O}$ and $x^2$ <script> & <sub>literal</sub>\nnext line' },
      ],
    },
    'H2O',
    'O2',
    '',
    '',
    '',
    '',
    '',
    '',
    '1,2',
  ]);
  sheet.getCell('E2').font = { vertAlign: 'subscript' };
  sheet.addRow([
    'formula',
    '',
    'shortAnswer',
    { formula: '"Cached question"', result: 'Cached question' },
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'exact',
    { formula: '1-1', result: 0 },
  ]);
  sheet.addRow([
    'display',
    '',
    'multipleChoice',
    'Displayed values',
    new Date('2026-01-02T00:00:00Z'),
    0.5,
    '',
    '',
    '',
    '',
    '',
    '',
    '1',
  ]);
  sheet.getCell('E4').numFmt = 'm/d';
  sheet.getCell('F4').numFmt = '# ?/?';
  book.addWorksheet('Ignored').addRow(['wrong']);
  await book.xlsx.writeFile(path.join(directory, 'chemistry.xlsx'));
})();
