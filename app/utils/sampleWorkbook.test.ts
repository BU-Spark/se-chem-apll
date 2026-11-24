/** @jest-environment node */
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { createSampleWorkbook } from './sampleWorkbook';
import { xlsxToRows } from './spreadsheetImport';
import { csvToCheckpoints, rowsToCheckpoints, sampleCheckpointCsv, sampleCheckpointRows } from './checkpointCsv';
import {
  rowsToQuestions,
  sampleQuestionBankCsv,
  SAMPLE_QUESTION_BANK_HEADERS,
  SAMPLE_QUESTION_BANK_CSV_ROWS,
} from './questionBankCsv';

it.each(['checkpoints', 'quiz'] as const)(
  'creates a valid, formatted %s sample that imports without errors',
  async (kind) => {
    const buffer = await createSampleWorkbook(kind);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const sheet = book.worksheets[0];
    expect(book.worksheets).toHaveLength(1);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.getRow(1).font.bold).toBe(true);
    expect(sheet.autoFilter).toBeTruthy();
    const rows = await xlsxToRows(buffer);
    const headers = rows[0];
    expect(sheet.getColumn(headers.indexOf('correct') + 1).numFmt).toBe('@');
    expect(sheet.getCell(2, headers.indexOf('correct') + 1).value).toBe('1,2');
    expect(rows[1][headers.indexOf('prompt')]).toContain('H<sub>2</sub>O, SO<sub>4</sub><sup>2−</sup>');
    expect(rows[1][headers.indexOf('prompt')]).toContain('Fe<sup>3+</sup>');
    expect(rows[1][headers.indexOf('prompt')]).toContain('$\\ce{H2O}$');
    expect(rows[1][headers.indexOf('choice_1')]).toBe('H<sub>2</sub>O');
    sheet.eachRow((row) => row.eachCell((cell) => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)));
    if (kind === 'checkpoints') {
      const result = rowsToCheckpoints(rows);
      expect(result.errors).toEqual([]);
      expect(result.checkpoints).toHaveLength(2);
      expect(result.checkpoints[1].questions[0].prompt).toContain('10<sup>−3</sup>');
      expect(result.checkpoints[1].questions[0].questionType).toBe('note');
    } else {
      const result = rowsToQuestions(rows);
      expect(result.errors).toEqual([]);
      expect(result.questions.some((question) => question.variants?.length)).toBe(true);
    }
  }
);

it('keeps CSV sample serialization unchanged when sharing sample data', () => {
  expect(Papa.parse(sampleCheckpointCsv()).data).toEqual(sampleCheckpointRows());
  expect(Papa.parse(sampleQuestionBankCsv()).data).toEqual([
    SAMPLE_QUESTION_BANK_HEADERS,
    ...SAMPLE_QUESTION_BANK_CSV_ROWS,
  ]);
  expect(csvToCheckpoints(sampleCheckpointCsv()).errors).toEqual([]);
  expect(sampleCheckpointRows()[1]).toContain('What is 2 + 2?');
  expect(SAMPLE_QUESTION_BANK_CSV_ROWS[0]).toContain('What is 2 + 2?');
});
