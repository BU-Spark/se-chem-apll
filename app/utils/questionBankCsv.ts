import Papa from 'papaparse';
import { makeChoice, type AuthoringQuestion } from '@/app/components/QuestionBank/types';
import { generateClientId } from '@/lib/generateClientId';

/**
 * CSV import/export for the quiz question bank.
 *
 * The header row below is the canonical interchange contract — do not change
 * it without a versioned migration. The authoring UI never exposes these
 * columns directly; this module is the boundary between CSV rows and
 * AuthoringQuestion objects.
 *
 * Round-trip is semantic, not lexical: numeric answers pass through Number(),
 * and text cells that begin with a spreadsheet-formula character (=, +, -, @)
 * are prefixed with an apostrophe on export and stripped again on import.
 */

export const QUIZ_CSV_HEADERS = [
  'type',
  'prompt',
  'choice_1',
  'choice_2',
  'choice_3',
  'choice_4',
  'choice_5',
  'choice_6',
  'choice_7',
  'choice_8',
  'correct',
  'answer_mode',
  'expected_answer',
  'minimum_answer',
  'maximum_answer',
] as const;

type QuizCsvHeader = (typeof QUIZ_CSV_HEADERS)[number];

export const SAMPLE_QUESTION_BANK_CSV_ROWS: string[][] = [
  ['multipleChoice', 'What is 2 + 2?', '3', '4', '5', '22', '', '', '', '', '2', '', '', '', ''],
  ['multipleChoice', 'Which are prime numbers?', '2', '3', '4', '9', '', '', '', '', '1,2', '', '', '', ''],
  ['shortAnswer', 'What is the square root of 16?', '', '', '', '', '', '', '', '', '', 'exact', '4', '', ''],
  ['shortAnswer', 'Estimate pi (acceptable range)', '', '', '', '', '', '', '', '', '', 'range', '', '3.1', '3.2'],
];

export type CsvRowError = {
  /** 1-based record number in the file; the header is row 1. */
  row: number;
  message: string;
};

export type CsvImportResult = {
  questions: AuthoringQuestion[];
  errors: CsvRowError[];
};

// ---------------------------------------------------------------------------
// Formula-injection guard (export prefixes, import strips)
// ---------------------------------------------------------------------------

const FORMULA_PREFIX = /^[=+\-@]/;

function guardTextCell(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function unguardTextCell(value: string): string {
  return value.startsWith("'") && FORMULA_PREFIX.test(value.slice(1)) ? value.slice(1) : value;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function emptyChoices(): string[] {
  return ['', '', '', '', '', '', '', ''];
}

function correctIndicesToCsv(choices: { correct: boolean }[]): string {
  return choices.flatMap((choice, idx) => (choice.correct ? [String(idx + 1)] : [])).join(',');
}

export function questionsToCsv(questions: AuthoringQuestion[]): string {
  const rows: string[][] = [[...QUIZ_CSV_HEADERS]];
  for (const q of questions) {
    if (q.type === 'multipleChoice') {
      const choices = emptyChoices();
      q.choices.slice(0, 8).forEach((choice, idx) => {
        choices[idx] = guardTextCell(choice.content);
      });
      rows.push([
        'multipleChoice',
        guardTextCell(q.prompt),
        ...choices,
        correctIndicesToCsv(q.choices),
        '',
        '',
        '',
        '',
      ]);
    } else {
      rows.push([
        'shortAnswer',
        guardTextCell(q.prompt),
        ...emptyChoices(),
        '',
        q.answer.mode,
        q.answer.mode === 'exact' ? q.answer.expected : '',
        q.answer.mode === 'range' ? q.answer.minimum : '',
        q.answer.mode === 'range' ? q.answer.maximum : '',
      ]);
    }
  }
  return Papa.unparse(rows, { newline: '\n' });
}

export function sampleQuestionBankCsv(): string {
  return Papa.unparse([[...QUIZ_CSV_HEADERS], ...SAMPLE_QUESTION_BANK_CSV_ROWS], { newline: '\n' });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function headerIndexMap(headerRow: string[]): Map<string, number> | CsvRowError[] {
  const map = new Map<string, number>();
  const errors: CsvRowError[] = [];
  headerRow.forEach((cell, idx) => {
    const key = cell.trim().toLowerCase();
    if (!key) return;
    if (map.has(key)) {
      errors.push({ row: 1, message: `Duplicate column "${key}".` });
      return;
    }
    map.set(key, idx);
  });

  for (const required of QUIZ_CSV_HEADERS) {
    if (!map.has(required)) {
      errors.push({ row: 1, message: `Missing required column "${required}".` });
    }
  }
  return errors.length > 0 ? errors : map;
}

function cellAt(row: string[], map: Map<string, number>, header: QuizCsvHeader): string {
  const idx = map.get(header);
  if (idx === undefined) return '';
  return row[idx] ?? '';
}

function parseCorrectIndices(raw: string, choiceCount: number, rowLabel: string): number[] | string {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return `${rowLabel}: multiple-choice questions require at least one correct index in "correct".`;
  }

  const indices: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return `${rowLabel}: "correct" must be 1-based integers (e.g. 1 or 1,3).`;
    }
    const oneBased = Number(part);
    if (oneBased < 1 || oneBased > choiceCount) {
      return `${rowLabel}: correct index ${oneBased} is out of range for ${choiceCount} choice(s).`;
    }
    if (seen.has(oneBased)) {
      return `${rowLabel}: duplicate correct index ${oneBased}.`;
    }
    seen.add(oneBased);
    indices.push(oneBased - 1);
  }
  return indices;
}

function isFiniteNumberString(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed));
}

function rowToQuestion(row: string[], map: Map<string, number>, rowNumber: number): AuthoringQuestion | CsvRowError {
  const rowLabel = `Row ${rowNumber}`;
  const type = cellAt(row, map, 'type').trim().toLowerCase();
  // Prompt/choice content keeps its whitespace; only validation trims.
  const prompt = unguardTextCell(cellAt(row, map, 'prompt'));

  if (prompt.trim() === '') {
    return { row: rowNumber, message: `${rowLabel}: prompt is required.` };
  }

  if (type !== 'multiplechoice' && type !== 'shortanswer') {
    return {
      row: rowNumber,
      message: `${rowLabel}: type must be "multipleChoice" or "shortAnswer" (got "${cellAt(row, map, 'type')}").`,
    };
  }

  if (type === 'multiplechoice') {
    const rawChoices = QUIZ_CSV_HEADERS.filter((h) => h.startsWith('choice_')).map((h) =>
      unguardTextCell(cellAt(row, map, h))
    );
    let end = rawChoices.length;
    while (end > 0 && rawChoices[end - 1].trim() === '') end -= 1;
    const contents = rawChoices.slice(0, end);

    if (contents.length < 2 || contents.length > 8) {
      return { row: rowNumber, message: `${rowLabel}: multiple-choice questions must have between 2 and 8 choices.` };
    }
    const interiorEmpty = contents.findIndex((content) => content.trim() === '');
    if (interiorEmpty !== -1) {
      return {
        row: rowNumber,
        message: `${rowLabel}: choice_${interiorEmpty + 1} is empty between other choices. Move later choices left.`,
      };
    }

    const parsed = parseCorrectIndices(cellAt(row, map, 'correct').trim(), contents.length, rowLabel);
    if (typeof parsed === 'string') {
      return { row: rowNumber, message: parsed };
    }

    const correct = new Set(parsed);
    return {
      id: generateClientId('question'),
      type: 'multipleChoice',
      prompt,
      choices: contents.map((content, idx) => makeChoice(content, correct.has(idx))),
    };
  }

  const answerMode = cellAt(row, map, 'answer_mode').trim().toLowerCase();
  if (answerMode !== 'exact' && answerMode !== 'range') {
    return { row: rowNumber, message: `${rowLabel}: short-answer answer_mode must be "exact" or "range".` };
  }

  if (answerMode === 'exact') {
    const expected = cellAt(row, map, 'expected_answer').trim();
    if (!isFiniteNumberString(expected)) {
      return { row: rowNumber, message: `${rowLabel}: expected_answer must be a finite number.` };
    }
    return {
      id: generateClientId('question'),
      type: 'shortAnswer',
      prompt,
      answer: { mode: 'exact', expected },
    };
  }

  const minimum = cellAt(row, map, 'minimum_answer').trim();
  const maximum = cellAt(row, map, 'maximum_answer').trim();
  if (!isFiniteNumberString(minimum) || !isFiniteNumberString(maximum)) {
    return { row: rowNumber, message: `${rowLabel}: minimum_answer and maximum_answer must be finite numbers.` };
  }
  if (Number(minimum) > Number(maximum)) {
    return { row: rowNumber, message: `${rowLabel}: minimum_answer must be less than or equal to maximum_answer.` };
  }
  return {
    id: generateClientId('question'),
    type: 'shortAnswer',
    prompt,
    answer: { mode: 'range', minimum, maximum },
  };
}

/**
 * Parse CSV text into authoring questions plus row-level errors. Valid rows
 * are returned even when other rows fail, so the import UI can offer an
 * explicit "import valid rows only" path.
 */
export function csvToQuestions(text: string): CsvImportResult {
  if (text.trim() === '') {
    return { questions: [], errors: [{ row: 1, message: 'CSV is empty.' }] };
  }

  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  const errors: CsvRowError[] = [];

  for (const papaError of parsed.errors) {
    if (papaError.code === 'TooFewFields' || papaError.code === 'TooManyFields') continue;
    errors.push({
      row: typeof papaError.row === 'number' ? papaError.row + 1 : 1,
      message: `CSV parse error (${papaError.code}): ${papaError.message ?? 'malformed input'}`,
    });
  }

  const rows = parsed.data;
  if (rows.length === 0) {
    errors.push({ row: 1, message: 'CSV is empty.' });
    return { questions: [], errors };
  }

  const headerMap = headerIndexMap(rows[0]);
  if (Array.isArray(headerMap)) {
    return { questions: [], errors: [...errors, ...headerMap] };
  }

  const questions: AuthoringQuestion[] = [];
  rows.slice(1).forEach((row, idx) => {
    const result = rowToQuestion(row, headerMap, idx + 2);
    if ('message' in result) {
      errors.push(result);
    } else {
      questions.push(result);
    }
  });

  return { questions, errors };
}
