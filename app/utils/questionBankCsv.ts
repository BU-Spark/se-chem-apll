import Papa from 'papaparse';
import { makeChoice, type AuthoringQuestion } from '@/app/components/QuestionBank/types';
import { questionVariables } from './questionVariants';
import { generateClientId } from '@/lib/generateClientId';

/**
 * Canonical quiz CSV: one row per question or variant, grouped by question_key.
 * var:<name> columns preserve case and supply literal template substitutions.
 * File-local keys are regenerated on export; database identities are never exported.
 * Text cells beginning with formula characters are guarded for spreadsheet use.
 */

// Shared answer columns; checkpoint CSV deliberately excludes quiz grouping and variables.
export const QUESTION_CSV_HEADERS = [
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

export const QUIZ_CSV_HEADERS = ['question_key', 'variant_key', ...QUESTION_CSV_HEADERS] as const;

const SAMPLE_VARIABLES = ['compound', 'mass', 'category', 'example'];
const SAMPLE_HEADERS = [...QUIZ_CSV_HEADERS, ...SAMPLE_VARIABLES.map((name) => `var:${name}`)];
const sampleRow = (cells: Record<string, string>): string[] => SAMPLE_HEADERS.map((header) => cells[header] ?? '');

export const SAMPLE_QUESTION_BANK_CSV_ROWS: string[][] = [
  sampleRow({
    question_key: 'arithmetic',
    type: 'multipleChoice',
    prompt: 'What is 2 + 2?',
    choice_1: '3',
    choice_2: '4',
    choice_3: '5',
    choice_4: '22',
    correct: '2',
  }),
  sampleRow({
    question_key: 'primes',
    type: 'multipleChoice',
    prompt: 'Which are prime numbers?',
    choice_1: '2',
    choice_2: '3',
    choice_3: '4',
    choice_4: '9',
    correct: '1,2',
  }),
  sampleRow({
    question_key: 'square-root',
    type: 'shortAnswer',
    prompt: 'What is the square root of 16?',
    answer_mode: 'exact',
    expected_answer: '4',
  }),
  sampleRow({
    question_key: 'pi',
    type: 'shortAnswer',
    prompt: 'Estimate pi (acceptable range)',
    answer_mode: 'range',
    minimum_answer: '3.1',
    maximum_answer: '3.2',
  }),
  sampleRow({
    question_key: 'moles',
    variant_key: 'water',
    type: 'shortAnswer',
    prompt: 'How many moles of {{compound}} are present in {{mass}}? Use rounded molar masses.',
    answer_mode: 'exact',
    expected_answer: '5',
    'var:compound': '$\\ce{H2O}$',
    'var:mass': '90 g',
  }),
  sampleRow({
    question_key: 'moles',
    variant_key: 'methane',
    type: 'shortAnswer',
    prompt: 'How many moles of {{compound}} are present in {{mass}}? Use rounded molar masses.',
    answer_mode: 'range',
    minimum_answer: '4.98',
    maximum_answer: '5.02',
    'var:compound': '$\\ce{CH4}$',
    'var:mass': '80 g',
  }),
  sampleRow({
    question_key: 'elements',
    variant_key: 'metals',
    type: 'multipleChoice',
    prompt: 'Which of these are {{category}}? Select every correct answer.',
    choice_1: '{{example}}',
    choice_2: 'Helium',
    choice_3: 'Carbon',
    correct: '1',
    'var:category': 'alkali metals',
    'var:example': 'Sodium',
  }),
  sampleRow({
    question_key: 'elements',
    variant_key: 'diatomic',
    type: 'multipleChoice',
    prompt: 'Which of these are {{category}}? Select every correct answer.',
    choice_1: '{{example}}',
    choice_2: 'Neon',
    choice_3: 'Nitrogen',
    choice_4: 'Argon',
    correct: '1,3',
    'var:category': 'diatomic elements at room temperature',
    'var:example': 'Oxygen',
  }),
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

export function guardTextCell(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function unguardTextCell(value: string): string {
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

/** Shared scalar answer cells, without quiz grouping or variant metadata. */
export function questionToCsvCells(question: AuthoringQuestion): string[] {
  const choices = emptyChoices();
  if (question.type === 'multipleChoice') {
    question.choices.slice(0, 8).forEach((choice, idx) => {
      choices[idx] = guardTextCell(choice.content);
    });
  }
  const answer = question.type === 'shortAnswer' ? question.answer : undefined;
  return [
    question.type,
    guardTextCell(question.prompt),
    ...choices,
    question.type === 'multipleChoice' ? correctIndicesToCsv(question.choices) : '',
    answer?.mode ?? '',
    answer?.mode === 'exact' ? answer.expected : '',
    answer?.mode === 'range' ? answer.minimum : '',
    answer?.mode === 'range' ? answer.maximum : '',
  ];
}

export function questionsToCsv(questions: AuthoringQuestion[]): string {
  if (questions.some((q) => q.variants?.length === 0)) {
    throw new Error('Add at least one variant to each variant question before exporting.');
  }
  const variables = [
    ...new Set(
      questions.flatMap((q) => [
        ...questionVariables(q.prompt),
        ...(q.variants ?? []).flatMap((v) => [
          ...Object.keys(v.values),
          ...('type' in v.answer && v.answer.type === 'multipleChoice'
            ? (v.answer.choices ?? []).flatMap((c) => questionVariables(c.content))
            : []),
        ]),
      ])
    ),
  ];
  const rows: string[][] = [[...QUIZ_CSV_HEADERS, ...variables.map((name) => `var:${name}`)]];
  questions.forEach((q, questionIndex) => {
    const append = (question: AuthoringQuestion, variantKey = '', values: Record<string, string> = {}) => {
      rows.push([
        `q${questionIndex + 1}`,
        variantKey,
        ...questionToCsvCells(question),
        ...variables.map((name) => guardTextCell(Object.hasOwn(values, name) ? values[name] : '')),
      ]);
    };
    if (q.type === 'multipleChoice' && q.variants) {
      q.variants.forEach((variant, index) =>
        append(
          {
            ...q,
            choices: (variant.answer.choices ?? []).map((choice) => ({
              ...choice,
              correct: variant.answer.correctChoiceIds.includes(choice.id),
            })),
          },
          `v${index + 1}`,
          variant.values
        )
      );
    } else if (q.type === 'shortAnswer' && q.variants) {
      q.variants.forEach((variant, index) => append({ ...q, answer: variant.answer }, `v${index + 1}`, variant.values));
    } else {
      append(q);
    }
  });
  return Papa.unparse(rows, { newline: '\n' });
}

export function sampleQuestionBankCsv(): string {
  return Papa.unparse([SAMPLE_HEADERS, ...SAMPLE_QUESTION_BANK_CSV_ROWS], { newline: '\n' });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function headerIndexMap(headerRow: string[]): Map<string, number> | CsvRowError[] {
  const map = new Map<string, number>();
  const errors: CsvRowError[] = [];
  headerRow.forEach((cell, idx) => {
    const trimmed = cell.trim();
    const key = /^var:/i.test(trimmed) ? `var:${trimmed.slice(4)}` : trimmed.toLowerCase();
    if (!QUIZ_CSV_HEADERS.some((header) => header === key) && !/^var:[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
      errors.push({ row: 1, message: `Unknown or invalid column "${key}". Variable columns use var:name.` });
      return;
    }
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

function cellAt(row: string[], map: Map<string, number>, header: string): string {
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

export function rowToQuestion(
  row: string[],
  map: Map<string, number>,
  rowNumber: number
): AuthoringQuestion | CsvRowError {
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

/** Import complete question groups only; a bad variant excludes its whole group. */
export function csvToQuestions(text: string, maxRows = 5000): CsvImportResult {
  if (text.trim() === '') {
    return { questions: [], errors: [{ row: 1, message: 'CSV is empty.' }] };
  }
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  // Broken quoting makes record boundaries unreliable. Do not partially import.
  if (parsed.errors.length) {
    return {
      questions: [],
      errors: parsed.errors.map((error) => ({
        row: typeof error.row === 'number' ? error.row + 1 : 1,
        message: `CSV parse error (${error.code}): ${error.message}`,
      })),
    };
  }
  const rows = parsed.data;
  if (rows.length - 1 > maxRows) {
    return {
      questions: [],
      errors: [{ row: 1, message: `The import limit is ${maxRows} data rows, including variants.` }],
    };
  }
  const headerMap = headerIndexMap(rows[0]);
  if (Array.isArray(headerMap)) return { questions: [], errors: headerMap };
  const variables = [...headerMap.keys()].filter((key) => key.startsWith('var:'));
  const errors: CsvRowError[] = [];
  const groups = new Map<string, { row: string[]; number: number }[]>();
  rows.slice(1).forEach((row, index) => {
    const key = cellAt(row, headerMap, 'question_key').trim();
    if (!key) {
      errors.push({ row: index + 2, message: `Row ${index + 2}: question_key is required.` });
      return;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ row, number: index + 2 });
  });
  const questions: AuthoringQuestion[] = [];
  for (const [key, records] of groups) {
    const startErrors = errors.length;
    const variants = new Set<string>();
    const entries: { question: AuthoringQuestion; values: Record<string, string> }[] = [];
    const isVariant = records.some(({ row }) => cellAt(row, headerMap, 'variant_key').trim() !== '');
    for (const { row, number } of records) {
      const fail = (message: string) =>
        errors.push({ row: number, message: `Row ${number} (question "${key}"): ${message} Entire question skipped.` });
      if (row.length !== rows[0].length) {
        fail('Column count does not match the header.');
        continue;
      }
      const variantKey = cellAt(row, headerMap, 'variant_key').trim();
      if (isVariant && (!variantKey || variants.has(variantKey))) {
        fail('Each variant_key must be nonempty and unique within its question.');
      }
      if (!isVariant && records.length > 1) fail('An ordinary question_key must occur only once.');
      variants.add(variantKey);
      const question = rowToQuestion(row, headerMap, number);
      if ('message' in question) {
        fail(question.message);
        continue;
      }
      const first = entries[0]?.question;
      if (first && (first.type !== question.type || first.prompt !== question.prompt)) {
        fail('All variants must have the same type and prompt template.');
      }
      const required = questionVariables(
        [question.prompt, ...(question.type === 'multipleChoice' ? question.choices.map((c) => c.content) : [])].join(
          '\n'
        )
      );
      const values = Object.fromEntries(
        variables.flatMap((column) => {
          const value = unguardTextCell(cellAt(row, headerMap, column));
          return value !== '' ? [[column.slice(4), value]] : [];
        })
      );
      if (!isVariant && (required.length || Object.keys(values).length))
        fail('Template variables require a variant_key.');
      if (isVariant) {
        if (question.type === 'shortAnswer' && !questionVariables(question.prompt).length) {
          fail('Numeric variants require a variable in the prompt.');
        }
        for (const name of required) {
          if (!Object.hasOwn(values, name) || !values[name].trim())
            fail(`Missing value for {{${name}}}; fill var:${name}.`);
        }
      }
      entries.push({ question, values });
    }
    if (errors.length !== startErrors || !entries.length) continue;
    const first = entries[0].question;
    if (!isVariant) {
      questions.push(first);
      continue;
    }
    if (first.type === 'multipleChoice') {
      questions.push({
        ...first,
        choices: [],
        variants: entries.map(({ question, values }) => {
          if (question.type !== 'multipleChoice') throw new Error('Inconsistent validated question type');
          return {
            id: generateClientId('variant'),
            values,
            answer: {
              type: 'multipleChoice',
              choices: question.choices.map(({ id, content }) => ({ id, content })),
              correctChoiceIds: question.choices.filter((c) => c.correct).map((c) => c.id),
            },
          };
        }),
      });
    } else {
      questions.push({
        ...first,
        answer: { mode: 'exact', expected: '' },
        variants: entries.map(({ question, values }) => {
          if (question.type !== 'shortAnswer') throw new Error('Inconsistent validated question type');
          return { id: generateClientId('variant'), values, answer: question.answer };
        }),
      });
    }
  }
  return { questions, errors: errors.sort((a, b) => a.row - b.row) };
}
