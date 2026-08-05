import { makeQuestion, serializeQuestionOptions, type FormQuestion } from '@/app/components/NodeForm/types';
import { validateMultipleChoiceAnswers } from '@/app/utils/multipleChoice';
import { validateShortAnswerOptions } from '@/app/utils/shortAnswer';
import { parseCsv, serializeCsv } from '@/app/utils/csv';

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

/** Sample rows: single-correct MC, multi-correct MC, short-answer exact, short-answer range. */
export const SAMPLE_QUIZ_CSV_ROWS: string[][] = [
  ['multipleChoice', 'What is 2 + 2?', '3', '4', '5', '22', '', '', '', '', '2', '', '', '', ''],
  ['multipleChoice', 'Which are prime numbers?', '2', '3', '4', '9', '', '', '', '', '1,2', '', '', '', ''],
  ['shortAnswer', 'What is the square root of 16?', '', '', '', '', '', '', '', '', '', 'exact', '4', '', ''],
  [
    'shortAnswer',
    'Estimate pi to one decimal place (acceptable range)',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'range',
    '',
    '3.1',
    '3.2',
  ],
];

export function sampleQuizQuestionsCsv(): string {
  return serializeCsv([[...QUIZ_CSV_HEADERS], ...SAMPLE_QUIZ_CSV_ROWS]);
}

function emptyChoices(): string[] {
  return ['', '', '', '', '', '', '', ''];
}

function choicesForExport(choices: string[]): string[] {
  const padded = emptyChoices();
  for (let i = 0; i < Math.min(choices.length, 8); i += 1) {
    padded[i] = choices[i] ?? '';
  }
  return padded;
}

/** Drop trailing empty choice cells; keep interior empties. */
export function trimTrailingEmptyChoices(choices: string[]): string[] {
  let end = choices.length;
  while (end > 0 && choices[end - 1].trim() === '') {
    end -= 1;
  }
  return choices.slice(0, end);
}

function correctIndicesToCsv(indices: number[]): string {
  return [...indices]
    .sort((a, b) => a - b)
    .map((i) => String(i + 1))
    .join(',');
}

function parseCorrectIndices(
  raw: string,
  choiceCount: number,
  rowLabel: string
): { indices: number[] } | { error: string } {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { error: `${rowLabel}: multiple-choice questions require at least one correct index in "correct".` };
  }

  const indices: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return { error: `${rowLabel}: "correct" must be 1-based integers (e.g. 1 or 1,3).` };
    }
    const oneBased = Number(part);
    if (oneBased < 1 || oneBased > choiceCount) {
      return {
        error: `${rowLabel}: correct index ${oneBased} is out of range for ${choiceCount} choice(s).`,
      };
    }
    const zeroBased = oneBased - 1;
    if (seen.has(zeroBased)) {
      return { error: `${rowLabel}: duplicate correct index ${oneBased}.` };
    }
    seen.add(zeroBased);
    indices.push(zeroBased);
  }
  return { indices };
}

function headerIndexMap(headerRow: string[]): Map<string, number> | { error: string } {
  const map = new Map<string, number>();
  headerRow.forEach((cell, idx) => {
    const key = cell.trim().toLowerCase();
    if (key) map.set(key, idx);
  });

  for (const required of QUIZ_CSV_HEADERS) {
    if (!map.has(required)) {
      return { error: `Missing required column "${required}".` };
    }
  }
  return map;
}

function cellAt(row: string[], map: Map<string, number>, header: QuizCsvHeader): string {
  const idx = map.get(header);
  if (idx === undefined) return '';
  return (row[idx] ?? '').trim();
}

function rowToFormQuestion(
  row: string[],
  map: Map<string, number>,
  rowNumber: number
): { question: FormQuestion } | { error: string } {
  const rowLabel = `Row ${rowNumber}`;
  const type = cellAt(row, map, 'type').toLowerCase();
  const prompt = cellAt(row, map, 'prompt');

  if (!prompt) {
    return { error: `${rowLabel}: prompt is required.` };
  }

  if (type !== 'multiplechoice' && type !== 'shortanswer') {
    return {
      error: `${rowLabel}: type must be "multipleChoice" or "shortAnswer" (got "${cellAt(row, map, 'type')}").`,
    };
  }

  const base = makeQuestion();

  if (type === 'multiplechoice') {
    const rawChoices = QUIZ_CSV_HEADERS.filter((h) => h.startsWith('choice_')).map((h) => cellAt(row, map, h));
    const choices = trimTrailingEmptyChoices(rawChoices);
    if (choices.length < 2 || choices.length > 8) {
      return { error: `${rowLabel}: multiple-choice questions must have between 2 and 8 choices.` };
    }

    const correctRaw = cellAt(row, map, 'correct');
    const parsed = parseCorrectIndices(correctRaw, choices.length, rowLabel);
    if ('error' in parsed) return parsed;

    const question: FormQuestion = {
      ...base,
      prompt,
      questionType: 'multipleChoice',
      choices,
      correctIndices: parsed.indices,
      answerMode: 'exact',
      expectedAnswer: '',
      minimumAnswer: '',
      maximumAnswer: '',
    };

    const options = serializeQuestionOptions(question);
    const mcError = validateMultipleChoiceAnswers([{ options, correctIndices: question.correctIndices }]);
    if (mcError) return { error: `${rowLabel}: ${mcError}` };

    return { question };
  }

  const answerModeRaw = cellAt(row, map, 'answer_mode').toLowerCase();
  if (answerModeRaw !== 'exact' && answerModeRaw !== 'range') {
    return { error: `${rowLabel}: short-answer answer_mode must be "exact" or "range".` };
  }

  const question: FormQuestion = {
    ...base,
    prompt,
    questionType: 'shortAnswer',
    choices: ['', ''],
    correctIndices: [],
    answerMode: answerModeRaw,
    expectedAnswer: answerModeRaw === 'exact' ? cellAt(row, map, 'expected_answer') : '',
    minimumAnswer: answerModeRaw === 'range' ? cellAt(row, map, 'minimum_answer') : '',
    maximumAnswer: answerModeRaw === 'range' ? cellAt(row, map, 'maximum_answer') : '',
  };

  const options = serializeQuestionOptions(question);
  const saError = validateShortAnswerOptions([{ options }]);
  if (saError) return { error: `${rowLabel}: ${saError}` };

  return { question };
}

export function formQuestionsToCsv(questions: FormQuestion[]): string {
  const dataRows = questions.map((q) => {
    if (q.questionType === 'multipleChoice') {
      return [
        'multipleChoice',
        q.prompt,
        ...choicesForExport(q.choices),
        correctIndicesToCsv(q.correctIndices),
        '',
        '',
        '',
        '',
      ];
    }

    return [
      'shortAnswer',
      q.prompt,
      ...emptyChoices(),
      '',
      q.answerMode,
      q.answerMode === 'exact' ? q.expectedAnswer : '',
      q.answerMode === 'range' ? q.minimumAnswer : '',
      q.answerMode === 'range' ? q.maximumAnswer : '',
    ];
  });

  return serializeCsv([[...QUIZ_CSV_HEADERS], ...dataRows]);
}

export type CsvToFormQuestionsResult = { ok: true; questions: FormQuestion[] } | { ok: false; errors: string[] };

export function csvToFormQuestions(text: string): CsvToFormQuestionsResult {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) {
    return { ok: false, errors: ['CSV is empty.'] };
  }

  const headerMap = headerIndexMap(rows[0]);
  if ('error' in headerMap) {
    return { ok: false, errors: [headerMap.error] };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ok: true, questions: [] };
  }

  const questions: FormQuestion[] = [];
  const errors: string[] = [];

  dataRows.forEach((row, idx) => {
    // Row numbers are 1-based in the file; header is row 1, so first data row is 2.
    const result = rowToFormQuestion(row, headerMap, idx + 2);
    if ('error' in result) {
      errors.push(result.error);
      return;
    }
    questions.push(result.question);
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, questions };
}
