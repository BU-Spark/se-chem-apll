/** UTF-8 BOM so Excel treats the file as UTF-8. */
export const CSV_UTF8_BOM = '\uFEFF';

/**
 * Parse RFC4180-style CSV into rows of string cells.
 * Supports quoted fields, escaped quotes (""), and CRLF/LF record separators.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  // Final cell/row (including trailing empty line only if we have content)
  if (cell.length > 0 || row.length > 0 || inQuotes) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialize rows to CSV text (no BOM). */
export function serializeCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell ?? '')).join(',')).join('\n');
}

/** Trigger a browser download of CSV text (adds UTF-8 BOM for Excel). */
export function downloadCsvFile(filename: string, csvText: string): void {
  const blob = new Blob([CSV_UTF8_BOM + csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
