import Papa from 'papaparse';
import { QUIZ_CSV_HEADERS, csvToQuestions, questionsToCsv, sampleQuestionBankCsv } from './questionBankCsv';
import type { AuthoringQuestion } from '@/app/components/QuestionBank/types';

function mcQuestion(
  overrides: Partial<Extract<AuthoringQuestion, { type: 'multipleChoice' }>> = {}
): AuthoringQuestion {
  return {
    id: 'q-mc',
    type: 'multipleChoice',
    prompt: 'Pick one',
    choices: [
      { id: 'c1', content: 'A', correct: false },
      { id: 'c2', content: 'B', correct: true },
      { id: 'c3', content: 'C', correct: false },
    ],
    ...overrides,
  };
}

function saExact(overrides: Partial<Extract<AuthoringQuestion, { type: 'shortAnswer' }>> = {}): AuthoringQuestion {
  return {
    id: 'q-sa',
    type: 'shortAnswer',
    prompt: 'Value?',
    answer: { mode: 'exact', expected: '42' },
    ...overrides,
  };
}

function csvWithRows(rows: string[][]): string {
  return Papa.unparse([[...QUIZ_CSV_HEADERS], ...rows], { newline: '\n' });
}

describe('sampleQuestionBankCsv', () => {
  it('parses into valid questions with no errors', () => {
    const result = csvToQuestions(sampleQuestionBankCsv());
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(4);
    expect(result.questions[0]).toMatchObject({ type: 'multipleChoice', prompt: 'What is 2 + 2?' });
    expect(result.questions[3]).toMatchObject({
      type: 'shortAnswer',
      answer: { mode: 'range', minimum: '3.1', maximum: '3.2' },
    });
  });
});

describe('questionsToCsv / csvToQuestions round trip', () => {
  it('round-trips multiple choice (single and multi correct) and short answer', () => {
    const questions: AuthoringQuestion[] = [
      mcQuestion({ prompt: 'Hello, world?' }),
      mcQuestion({
        id: 'q-mc2',
        prompt: 'Multi',
        choices: [
          { id: 'c1', content: 'A', correct: true },
          { id: 'c2', content: 'B', correct: false },
          { id: 'c3', content: 'C', correct: true },
        ],
      }),
      saExact({ answer: { mode: 'exact', expected: '-2.5' } }),
      { id: 'q-range', type: 'shortAnswer', prompt: 'Range', answer: { mode: 'range', minimum: '1', maximum: '3' } },
    ];

    const result = csvToQuestions(questionsToCsv(questions));
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(4);

    const [mc1, mc2, sa1, sa2] = result.questions;
    expect(mc1).toMatchObject({ type: 'multipleChoice', prompt: 'Hello, world?' });
    if (mc1.type === 'multipleChoice') {
      expect(mc1.choices.map((c) => c.content)).toEqual(['A', 'B', 'C']);
      expect(mc1.choices.map((c) => c.correct)).toEqual([false, true, false]);
    }
    if (mc2.type === 'multipleChoice') {
      expect(mc2.choices.map((c) => c.correct)).toEqual([true, false, true]);
    }
    expect(sa1).toMatchObject({ type: 'shortAnswer', answer: { mode: 'exact', expected: '-2.5' } });
    expect(sa2).toMatchObject({ type: 'shortAnswer', answer: { mode: 'range', minimum: '1', maximum: '3' } });
  });

  it('exports 1-based correct indices', () => {
    const csv = questionsToCsv([mcQuestion()]);
    expect(csv).toContain('\nmultipleChoice,Pick one,A,B,C,,,,,,2,,,,');
  });

  it('pads multiple-choice choices to eight columns', () => {
    const parsed = Papa.parse(questionsToCsv([mcQuestion()]));
    expect(parsed.data[1]).toHaveLength(QUIZ_CSV_HEADERS.length);
  });

  it('preserves leading/trailing whitespace in prompts and choices', () => {
    const spaced = mcQuestion({
      prompt: '  spaced prompt  ',
      choices: [
        { id: 'c1', content: '  A  ', correct: true },
        { id: 'c2', content: 'B', correct: false },
      ],
    });
    const result = csvToQuestions(questionsToCsv([spaced]));
    expect(result.errors).toEqual([]);
    expect(result.questions[0].prompt).toBe('  spaced prompt  ');
    if (result.questions[0].type === 'multipleChoice') {
      expect(result.questions[0].choices[0].content).toBe('  A  ');
    }
  });

  it('guards spreadsheet-formula text on export and strips it on import', () => {
    const dangerous = mcQuestion({ prompt: '=HYPERLINK("https://evil.example")' });
    const csv = questionsToCsv([dangerous]);
    expect(csv).toContain("'=HYPERLINK");

    const result = csvToQuestions(csv);
    expect(result.errors).toEqual([]);
    expect(result.questions[0].prompt).toBe('=HYPERLINK("https://evil.example")');
  });

  it('treats numeric-looking negative answers as data, not guarded text', () => {
    const csv = questionsToCsv([saExact({ answer: { mode: 'exact', expected: '-2.5' } })]);
    const result = csvToQuestions(csv);
    expect(result.questions[0]).toMatchObject({ answer: { mode: 'exact', expected: '-2.5' } });
  });
});

describe('csvToQuestions diagnostics', () => {
  it('returns empty questions and no errors for a header-only file', () => {
    expect(csvToQuestions(csvWithRows([]))).toEqual({ questions: [], errors: [] });
  });

  it('reports an empty file', () => {
    const result = csvToQuestions('');
    expect(result.questions).toEqual([]);
    expect(result.errors[0].message).toMatch(/empty/i);
  });

  it('reports missing required columns', () => {
    const result = csvToQuestions('type,prompt\nmultipleChoice,Hi');
    expect(result.errors.some((e) => /Missing required column/.test(e.message))).toBe(true);
  });

  it('reports duplicate headers', () => {
    const header = [...QUIZ_CSV_HEADERS];
    header[3] = 'choice_1';
    const result = csvToQuestions(Papa.unparse([header], { newline: '\n' }));
    expect(result.errors.some((e) => /Duplicate column "choice_1"/.test(e.message))).toBe(true);
  });

  it('reports row numbers for row-level errors', () => {
    const result = csvToQuestions(
      csvWithRows([['essay', 'Write a lot', '', '', '', '', '', '', '', '', '', '', '', '', '']])
    );
    expect(result.questions).toEqual([]);
    expect(result.errors[0]).toMatchObject({ row: 2 });
    expect(result.errors[0].message).toMatch(/Row 2.*type must be/i);
  });

  it('rejects multiple choice with too few choices', () => {
    const result = csvToQuestions(
      csvWithRows([['multipleChoice', 'Only one', 'A', '', '', '', '', '', '', '', '1', '', '', '', '']])
    );
    expect(result.errors[0].message).toMatch(/Row 2.*2 and 8 choices/i);
  });

  it('rejects interior empty choices', () => {
    const result = csvToQuestions(
      csvWithRows([['multipleChoice', 'Gap', 'A', '', 'C', '', '', '', '', '', '1', '', '', '', '']])
    );
    expect(result.errors[0].message).toMatch(/Row 2.*choice_2 is empty/i);
  });

  it('rejects out-of-range and malformed correct indices', () => {
    const outOfRange = csvToQuestions(
      csvWithRows([['multipleChoice', 'Pick', 'A', 'B', '', '', '', '', '', '', '3', '', '', '', '']])
    );
    expect(outOfRange.errors[0].message).toMatch(/out of range/);

    const malformed = csvToQuestions(
      csvWithRows([['multipleChoice', 'Pick', 'A', 'B', '', '', '', '', '', '', 'x', '', '', '', '']])
    );
    expect(malformed.errors[0].message).toMatch(/1-based integers/);
  });

  it('rejects invalid short-answer ranges and numbers', () => {
    const inverted = csvToQuestions(
      csvWithRows([['shortAnswer', 'Bad range', '', '', '', '', '', '', '', '', '', 'range', '', '10', '5']])
    );
    expect(inverted.errors[0].message).toMatch(/less than or equal/i);

    const notNumeric = csvToQuestions(
      csvWithRows([['shortAnswer', 'Bad exact', '', '', '', '', '', '', '', '', '', 'exact', 'abc', '', '']])
    );
    expect(notNumeric.errors[0].message).toMatch(/finite number/i);
  });

  it('returns valid rows alongside errors so import can proceed partially', () => {
    const result = csvToQuestions(
      csvWithRows([
        ['multipleChoice', 'Good', 'A', 'B', '', '', '', '', '', '', '1', '', '', '', ''],
        ['essay', 'Bad', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ])
    );
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].prompt).toBe('Good');
    expect(result.errors).toHaveLength(1);
  });

  it('surfaces malformed quoting as a parse error instead of guessing', () => {
    const result = csvToQuestions(csvWithRows([]) + '\n"unterminated,value');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /parse error/i.test(e.message) || /prompt|type/i.test(e.message))).toBe(true);
  });
});
