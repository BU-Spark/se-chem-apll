import Papa from 'papaparse';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateQuestion } from '@/app/components/QuestionBank/validation';
import { authoringQuestionToPayload } from '@/app/components/QuestionBank/adapters';
import { quizVariantOptions, resolveQuizVariant } from './questionVariants';
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
  return Papa.unparse([[...QUIZ_CSV_HEADERS], ...rows.map((row, i) => [`q${i + 1}`, '', ...row])], { newline: '\n' });
}

describe('sampleQuestionBankCsv', () => {
  it('parses into valid questions with no errors', () => {
    const result = csvToQuestions(sampleQuestionBankCsv());
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(6);
    expect(result.questions[0]).toMatchObject({ type: 'multipleChoice', prompt: 'What is 2 + 2?' });
    expect(result.questions[3]).toMatchObject({
      type: 'shortAnswer',
      answer: { mode: 'range', minimum: '3.1', maximum: '3.2' },
    });
  });
});

describe('questionsToCsv / csvToQuestions round trip', () => {
  it.each([false, true])('preserves ordinary double-brace LaTeX with variants in the bank: %s', (includeVariants) => {
    const ordinary = [
      saExact({ prompt: '$\\frac{{a}}{2}$' }),
      mcQuestion({
        prompt: '$x^{{n}}$',
        choices: [
          { id: 'c1', content: '$x^{{k}}$', correct: true },
          { id: 'c2', content: '2', correct: false },
        ],
      }),
    ];
    const questions = includeVariants
      ? [...ordinary, ...csvToQuestions(sampleQuestionBankCsv()).questions.filter((q) => q.variants)]
      : ordinary;
    const csv = questionsToCsv(questions);
    const headers = Papa.parse<string[]>(csv).data[0];
    expect(headers).not.toEqual(expect.arrayContaining(['var:a']));
    expect(headers).not.toEqual(expect.arrayContaining(['var:n']));
    expect(headers).not.toEqual(expect.arrayContaining(['var:k']));
    const imported = csvToQuestions(csv);
    expect(imported.errors).toEqual([]);
    expect(imported.questions).toHaveLength(questions.length);
    expect(questionsToCsv(imported.questions)).toBe(csv);
  });

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
    expect(csv).toContain('\nq1,,multipleChoice,Pick one,A,B,C,,,,,,2,,,,');
  });

  it('does not silently omit a question with an empty variant list', () => {
    expect(() => questionsToCsv([saExact({ variants: [] })])).toThrow(/at least one variant/);
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
    header[5] = 'choice_1';
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

function structuredCsv(records: Record<string, string>[], variables: string[] = []): string {
  const headers = [...QUIZ_CSV_HEADERS, ...variables.map((name) => `var:${name}`)];
  return Papa.unparse([headers, ...records.map((row) => headers.map((h) => row[h] ?? ''))], { newline: '\n' });
}
const numericRow = {
  question_key: 'moles',
  variant_key: 'one',
  type: 'shortAnswer',
  prompt: 'Moles of {{Compound}} in {{mass}}?',
  answer_mode: 'exact',
  expected_answer: '5',
  'var:Compound': '$\\ce{H2O}$',
  'var:mass': '90 g',
};

describe('variant CSV contract', () => {
  it('keeps the checked-in demo identical to the download and publishable', () => {
    expect(readFileSync(join(process.cwd(), 'samples/quiz-questions.csv'), 'utf8').trimEnd()).toBe(
      sampleQuestionBankCsv()
    );
    const result = csvToQuestions(sampleQuestionBankCsv());
    expect(result.errors).toEqual([]);
    result.questions.forEach((q) => expect(validateQuestion(q)).toEqual([]));
    expect(result.questions[4].variants).toHaveLength(2);
    expect(result.questions[5].variants).toHaveLength(2);
  });

  it('round-trips templates, variant answers, choice sets and correct counts with fresh internal IDs', () => {
    const original = csvToQuestions(sampleQuestionBankCsv()).questions;
    const exported = questionsToCsv(original);
    const result = csvToQuestions(exported);
    expect(result.errors).toEqual([]);
    expect(questionsToCsv(result.questions)).toBe(exported);
    original.forEach((q, index) => {
      const imported = result.questions[index];
      expect(imported.id).not.toBe(q.id);
      if (!q.variants) return;
      const before = quizVariantOptions(authoringQuestionToPayload(q, index))!;
      const after = quizVariantOptions(authoringQuestionToPayload(imported, index))!;
      q.variants.forEach((v, i) => {
        expect(imported.variants![i].id).not.toBe(v.id);
        expect(resolveQuizVariant(imported.prompt, after, i)).toEqual({
          ...resolveQuizVariant(q.prompt, before, i),
          variantId: imported.variants![i].id,
        });
      });
    });
    const mc = result.questions[5];
    if (mc.type !== 'multipleChoice') throw new Error('Expected MCQ');
    expect(mc.choices).toEqual([]);
    expect(mc.variants!.map((v) => v.answer.choices!.length)).toEqual([3, 4]);
    expect(mc.variants!.map((v) => v.answer.correctChoiceIds.length)).toEqual([1, 2]);
  });

  it('allows MCQ variants without any template variables', () => {
    const rows: Record<string, string>[] = [
      {
        question_key: 'even',
        variant_key: 'one',
        type: 'multipleChoice',
        prompt: 'Select even numbers.',
        choice_1: '2',
        choice_2: '3',
        correct: '1',
      },
      {
        question_key: 'even',
        variant_key: 'two',
        type: 'multipleChoice',
        prompt: 'Select even numbers.',
        choice_1: '4',
        choice_2: '6',
        choice_3: '7',
        correct: '1,2',
      },
    ];
    const result = csvToQuestions(structuredCsv(rows));
    expect(result.errors).toEqual([]);
    expect(result.questions[0].variants).toHaveLength(2);
  });

  it('preserves first-seen question order and each group’s row order even when interleaved', () => {
    const result = csvToQuestions(
      structuredCsv(
        [
          numericRow,
          {
            question_key: 'ordinary',
            type: 'shortAnswer',
            prompt: 'Value?',
            answer_mode: 'exact',
            expected_answer: '9',
          },
          { ...numericRow, variant_key: 'two', expected_answer: '10', 'var:mass': '180 g' },
        ],
        ['Compound', 'mass']
      )
    );
    expect(result.errors).toEqual([]);
    expect(result.questions.map((q) => q.prompt)).toEqual([numericRow.prompt, 'Value?']);
    expect(result.questions[0].variants!.map((v) => v.values.mass)).toEqual(['90 g', '180 g']);
  });

  it.each([
    ['missing value', { 'var:mass': '' }, /Missing value for \{\{mass\}\}/],
    ['duplicate key', { variant_key: 'one' }, /unique/],
    ['mixed ordinary row', { variant_key: '' }, /nonempty/],
    ['different prompt', { prompt: 'Changed {{Compound}} {{mass}}' }, /same type and prompt/],
    ['different type', { type: 'multipleChoice', choice_1: 'A', choice_2: 'B', correct: '1' }, /same type and prompt/],
    ['invalid answer', { expected_answer: 'bad' }, /finite number/],
  ])('rejects the entire group for %s while retaining unrelated valid questions', (_label, changes, message) => {
    const result = csvToQuestions(
      structuredCsv(
        [
          numericRow,
          { ...numericRow, variant_key: 'two', ...changes },
          { question_key: 'good', type: 'shortAnswer', prompt: 'Value?', answer_mode: 'exact', expected_answer: '1' },
        ],
        ['Compound', 'mass']
      )
    );
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].prompt).toBe('Value?');
    expect(result.errors).toEqual([expect.objectContaining({ row: 3, message: expect.stringMatching(message) })]);
  });

  it('requires template variables in choices as well as prompts, preserving case', () => {
    const mc = {
      question_key: 'mc',
      variant_key: 'v',
      type: 'multipleChoice',
      prompt: 'Choose.',
      choice_1: '{{Name}}',
      choice_2: '{{name}}',
      correct: '1',
      'var:Name': 'A',
      'var:name': 'B',
    };
    expect(csvToQuestions(structuredCsv([mc], ['Name', 'name'])).errors).toEqual([]);
    const missing = csvToQuestions(structuredCsv([mc], ['name']));
    expect(missing.questions).toEqual([]);
    expect(missing.errors[0].message).toContain('var:Name');
  });

  it('keeps Markdown, LaTeX, commas, quotes, newlines, whitespace and formula text in values', () => {
    const value = '= literal, "quoted"\n$\\frac{1}{2}$ **bold**  ';
    const result = csvToQuestions(structuredCsv([{ ...numericRow, 'var:Compound': value }], ['Compound', 'mass']));
    const csv = questionsToCsv(result.questions);
    expect(csv).toContain("'= literal");
    const copy = csvToQuestions(csv);
    expect(copy.errors).toEqual([]);
    expect(copy.questions[0].variants![0].values.Compound).toBe(value);
  });

  it('rejects invalid and duplicate variable columns', () => {
    expect(csvToQuestions(structuredCsv([numericRow], ['bad-name'])).errors[0].message).toMatch(/invalid column/);
    expect(csvToQuestions(structuredCsv([numericRow], ['mass', 'mass'])).errors[0].message).toMatch(/Duplicate column/);
  });

  it('requires question keys, unique ordinary groups, and variant keys for supplied variable values', () => {
    const ordinary = {
      question_key: 'one',
      type: 'shortAnswer',
      prompt: 'Value?',
      answer_mode: 'exact',
      expected_answer: '1',
    };
    expect(csvToQuestions(structuredCsv([{ ...ordinary, question_key: '' }])).errors[0].message).toMatch(
      /question_key is required/
    );
    expect(csvToQuestions(structuredCsv([ordinary, ordinary])).questions).toEqual([]);
    expect(csvToQuestions(structuredCsv([{ ...numericRow, variant_key: '' }])).errors).toEqual([]);
    expect(csvToQuestions(structuredCsv([{ ...ordinary, 'var:mass': '90 g' }], ['mass'])).errors[0].message).toMatch(
      /require a variant_key/
    );
  });

  it('counts variant records toward the import limit and rejects incorrect row widths', () => {
    expect(csvToQuestions(sampleQuestionBankCsv(), 7).errors[0].message).toMatch(/7 data rows/);
    const rows = Papa.parse<string[]>(structuredCsv([numericRow], ['Compound', 'mass'])).data;
    rows[1].pop();
    expect(csvToQuestions(Papa.unparse(rows)).errors[0].message).toMatch(/Column count/);
  });
});
