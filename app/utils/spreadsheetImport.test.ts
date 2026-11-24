/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { isXlsxFile, spreadsheetCellText, xlsxToRows } from './spreadsheetImport';
import { csvToQuestions, rowsToQuestions } from './questionBankCsv';
import { CHECKPOINT_CSV_HEADERS, csvToCheckpoints, rowsToCheckpoints } from './checkpointCsv';

const bytes = readFileSync(join(__dirname, '__fixtures__/chemistry.xlsx'));
const buffer = () => Uint8Array.from(bytes).buffer;

describe('XLSX import', () => {
  it('preserves chemistry runs, merges adjacent alignment, escapes HTML, and retains math', async () => {
    const rows = await xlsxToRows(buffer());
    expect(rows).toHaveLength(4);
    expect(rows[1][3]).toBe(
      '2H<sub>2</sub> + O<sub>2</sub> → 2H<sub>2</sub>O; SO<sub>4</sub><sup>2−</sup>; Fe<sup>3+</sup>; 10<sup>−3</sup>; $\\ce{H2O}$ and $x^2$ &lt;script&gt; &amp; &lt;sub&gt;literal&lt;/sub&gt;\nnext line'
    );
    expect(rows[1][4]).toBe('<sub>H2O</sub>');
    expect(rows[1][12]).toBe('1,2');
    expect(rows[2][3]).toBe('Cached question');
    expect(rows[2][14]).toBe('0');
    expect(rows[3][4]).toBe('1/2');
    expect(rows[3][5].trim()).toBe('1/2');
    expect(rows.every((row) => row.length === rows[0].length)).toBe(true);
    expect(rowsToQuestions(rows).errors).toEqual([]);
  });

  it('uses the same validators, diagnostics and numbering as CSV', async () => {
    const rows = await xlsxToRows(buffer());
    rows[2][13] = 'bad-mode';
    const csv = csvToQuestions(Papa.unparse(rows));
    const xlsx = rowsToQuestions(rows);
    expect(xlsx.errors).toEqual(csv.errors);
    expect(xlsx.questions).toHaveLength(csv.questions.length);
    expect(xlsx.errors[0].row).toBe(3);
    const checkpoints = [
      [...CHECKPOINT_CSV_HEADERS],
      ...rows.slice(1).map((row, i) => ['chem', '1', String(i + 1), '', '', ...row.slice(2)]),
    ];
    expect(rowsToCheckpoints(checkpoints).errors).toEqual(csvToCheckpoints(Papa.unparse(checkpoints)).errors);
    expect(
      rowsToQuestions([
        ['wrong', 'other'],
        ['value', 'text'],
      ]).errors
    ).toEqual(csvToQuestions('wrong,other\nvalue,text').errors);
  });

  it('skips blank rows, pads empty cells, and retains extra populated columns', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Sheet');
    sheet.addRow(['prompt', 'choice_1']);
    sheet.addRow(['   ']);
    sheet.getCell('A2').font = { vertAlign: 'subscript' };
    sheet.addRow(['value']);
    sheet.addRow(['value', '', 'extra']);
    expect(await xlsxToRows((await book.xlsx.writeBuffer()) as ArrayBuffer)).toEqual([
      ['prompt', 'choice_1'],
      ['value', ''],
      ['value', '', 'extra'],
    ]);
    const limited = await xlsxToRows((await book.xlsx.writeBuffer()) as ArrayBuffer, 1);
    expect(rowsToQuestions(limited, 1).errors[0].message).toContain('import limit is 1');
  });

  it('rejects missing formula caches, Excel errors and corrupt workbooks', async () => {
    const book = new ExcelJS.Workbook();
    const cell = book.addWorksheet('Sheet').getCell('A1');
    cell.value = { formula: '1+1' };
    expect(() => spreadsheetCellText(cell, true)).toThrow('Cell A1: formula has no cached result');
    cell.value = { error: '#DIV/0!' };
    expect(() => spreadsheetCellText(cell, true)).toThrow('Excel error');
    await expect(xlsxToRows(new ArrayBuffer(10))).rejects.toThrow('Could not read');
  });

  it('formats the 1904 date system and keeps control fields literal', () => {
    const book = new ExcelJS.Workbook();
    const cell = book.addWorksheet('Sheet').getCell('A1');
    cell.value = new Date('2026-01-02T00:00:00Z');
    cell.numFmt = 'yyyy-mm-dd';
    expect(spreadsheetCellText(cell, true, true)).toBe('2026-01-02');
    cell.value = '<key>&';
    cell.font = { vertAlign: 'superscript' };
    expect(spreadsheetCellText(cell, false)).toBe('<key>&');
  });

  it('preserves math arrows, comparisons and ampersands across rich-text run boundaries', () => {
    const cell = new ExcelJS.Workbook().addWorksheet('Sheet').getCell('A1');
    cell.value = {
      richText: [
        { text: 'H' },
        { text: '2', font: { vertAlign: 'subscript' } },
        { text: 'O $\\ce{H2O ' },
        { text: '-> H2O}$', font: { bold: true } },
        { text: ' $x < 2$ $a & b$ <img src=x>' },
      ],
    };
    expect(spreadsheetCellText(cell, true)).toBe('H<sub>2</sub>O $\\ce{H2O -> H2O}$ $x < 2$ $a & b$ &lt;img src=x&gt;');
    cell.value = { formula: '0', result: 0 };
    expect(spreadsheetCellText(cell, true)).toBe('0');
    cell.value = { formula: 'FALSE()', result: false };
    expect(spreadsheetCellText(cell, true)).toBe('false');
  });

  it('detects extensions case insensitively and rejects other formats', () => {
    expect(isXlsxFile({ name: 'CHEM.XLSX' } as File)).toBe(true);
    expect(isXlsxFile({ name: 'chem.csv' } as File)).toBe(false);
    expect(() => isXlsxFile({ name: 'chem.xls' } as File)).toThrow('Choose');
  });
});
