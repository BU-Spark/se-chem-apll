import type { Cell, CellValue } from 'exceljs';
import { format } from 'ssf';
import { mapOutsideMath } from '@/app/components/QuestionBank/mathMarkdown';

export const SPREADSHEET_ACCEPT =
  '.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const contentColumn = (header: string) =>
  /^(prompt|choice_[1-8]|feedback_correct|feedback_incorrect)$/.test(header.trim().toLowerCase()) ||
  header.trim().startsWith('var:');

/** Only generated tags are HTML; authored markup remains literal. */
export function spreadsheetCellText(cell: Cell, markup: boolean, date1904 = false): string {
  let value: CellValue = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
    // cell.value omits falsy formula results in ExcelJS; cell.result preserves them.
    const result = cell.result;
    if (result === undefined || result === null)
      throw new Error(
        `Cell ${cell.address}: formula has no cached result. Recalculate and save the workbook in Excel.`
      );
    value = result;
  }
  if (typeof value === 'object' && 'error' in value)
    throw new Error(`Cell ${cell.address}: Excel error ${value.error}.`);
  if (typeof value === 'object' && 'richText' in value) {
    const runs: { text: string; alignment?: string }[] = [];
    for (const run of value.richText) {
      const alignment = run.font?.vertAlign ?? cell.font?.vertAlign;
      const last = runs.at(-1);
      if (last && last.alignment === alignment) last.text += run.text;
      else runs.push({ text: run.text, alignment });
    }
    return renderRuns(runs, markup);
  }
  let text: string;
  if (value instanceof Date) {
    // SSF accepts serials; Excel's two date systems differ by 1462 days.
    let serial = value.getTime() / 86400000 + 25569;
    if (serial < 61) serial -= 1; // Excel's fictitious 1900-02-29
    if (date1904) serial -= 1462;
    text = format(cell.numFmt || 'm/d/yy', serial, { date1904 });
  } else if (typeof value === 'number') {
    text = format(cell.numFmt || 'General', value, { date1904 });
  } else if (typeof value === 'object' && 'text' in value) text = value.text;
  else text = String(value);
  return renderRuns([{ text, alignment: cell.font?.vertAlign }], markup);
}

type TextRun = { text: string; alignment?: string };

function renderRuns(runs: TextRun[], markup: boolean): string {
  const source = runs.map((run) => run.text).join('');
  if (!markup) return source;
  // Math is already interpreted as text by the Markdown renderer. Keep its
  // source intact, including chemistry arrows and comparisons, across runs.
  return mapOutsideMath(source, (text, _before, _after, offset) => {
    let start = 0;
    return runs
      .map((run) => {
        const end = start + run.text.length;
        const slice = run.text.slice(
          Math.max(0, offset - start),
          Math.max(0, Math.min(end, offset + text.length) - start)
        );
        start = end;
        return wrap(slice, run.alignment);
      })
      .join('');
  });
}

function wrap(text: string, alignment: string | undefined): string {
  const escaped = escapeHtml(text);
  if (!text) return '';
  if (alignment === 'subscript') return `<sub>${escaped}</sub>`;
  if (alignment === 'superscript') return `<sup>${escaped}</sup>`;
  return escaped;
}

export async function xlsxToRows(buffer: ArrayBuffer, maxRows = 5000): Promise<string[][]> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('Could not read that XLSX file. Use an unencrypted .xlsx workbook.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook has no worksheets.');
  const rows: string[][] = [];
  let headers: string[] | undefined;
  // Iterate stored rows/cells, avoiding a huge sparse worksheet's declared dimensions.
  sheet.eachRow((row) => {
    if (rows.length > maxRows + 1) return;
    const cells: string[] = [];
    let hasContent = false;
    row.eachCell((cell, column) => {
      if (cell.value === null || cell.value === undefined) return;
      if (column > 256) throw new Error('The worksheet exceeds the limit of 256 columns.');
      while (cells.length < column) cells.push('');
      const plain = spreadsheetCellText(cell, false, workbook.properties.date1904);
      if (plain.trim()) hasContent = true;
      cells[column - 1] =
        headers && contentColumn(headers[column - 1] ?? '')
          ? spreadsheetCellText(cell, true, workbook.properties.date1904)
          : plain;
    });
    if (!hasContent) return;
    if (!headers) headers = cells;
    else while (cells.length < headers.length) cells.push('');
    rows.push(cells);
  });
  return rows;
}

export function isXlsxFile(file: File): boolean {
  if (/\.xlsx$/i.test(file.name)) return true;
  if (/\.csv$/i.test(file.name)) return false;
  throw new Error('Choose a .csv or .xlsx file.');
}
