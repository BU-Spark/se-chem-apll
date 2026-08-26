import {
  SAMPLE_QUIZ_CSV_ROWS,
  QUIZ_CSV_HEADERS,
  csvToFormQuestions,
  formQuestionsToCsv,
  sampleQuizQuestionsCsv,
  trimTrailingEmptyChoices,
} from './quizQuestionCsv';
import type { QuizFormQuestion } from '@/app/components/NodeForm/types';
import { serializeCsv } from './csv';

function mcQuestion(overrides: Partial<QuizFormQuestion> = {}): QuizFormQuestion {
  return {
    id: 'q-mc',
    prompt: 'Pick one',
    questionType: 'multipleChoice',
    choices: ['A', 'B', 'C'],
    correctIndices: [1],
    answerMode: 'exact',
    expectedAnswer: '',
    minimumAnswer: '',
    maximumAnswer: '',
    ...overrides,
  };
}

function saExact(overrides: Partial<QuizFormQuestion> = {}): QuizFormQuestion {
  return {
    id: 'q-sa',
    prompt: 'Value?',
    questionType: 'shortAnswer',
    choices: ['', ''],
    correctIndices: [],
    answerMode: 'exact',
    expectedAnswer: '42',
    minimumAnswer: '',
    maximumAnswer: '',
    ...overrides,
  };
}

describe('trimTrailingEmptyChoices', () => {
  it('drops trailing empties and keeps interior gaps', () => {
    expect(trimTrailingEmptyChoices(['A', '', 'C', '', ''])).toEqual(['A', '', 'C']);
  });
});

describe('sampleQuizQuestionsCsv', () => {
  it('parses into valid form questions', () => {
    const result = csvToFormQuestions(sampleQuizQuestionsCsv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions).toHaveLength(SAMPLE_QUIZ_CSV_ROWS.length);
    expect(result.questions[0].questionType).toBe('multipleChoice');
    expect(result.questions[0].correctIndices).toEqual([1]);
    expect(result.questions[1].correctIndices).toEqual([0, 1]);
    expect(result.questions[2]).toMatchObject({
      questionType: 'shortAnswer',
      answerMode: 'exact',
      expectedAnswer: '4',
    });
    expect(result.questions[3]).toMatchObject({
      questionType: 'shortAnswer',
      answerMode: 'range',
      minimumAnswer: '3.1',
      maximumAnswer: '3.2',
    });
  });
});

describe('formQuestionsToCsv / csvToFormQuestions', () => {
  it('round-trips multiple choice and short answer', () => {
    const questions = [
      mcQuestion({ prompt: 'Hello, world?', choices: ['X', 'Y'], correctIndices: [0] }),
      mcQuestion({
        id: 'q-mc2',
        prompt: 'Multi',
        choices: ['A', 'B', 'C', 'D'],
        correctIndices: [0, 2],
      }),
      saExact({ prompt: 'Exact', expectedAnswer: '-2.5' }),
      saExact({
        id: 'q-range',
        prompt: 'Range',
        answerMode: 'range',
        expectedAnswer: '',
        minimumAnswer: '1',
        maximumAnswer: '3',
      }),
    ];

    const csv = formQuestionsToCsv(questions);
    const result = csvToFormQuestions(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.questions).toHaveLength(4);
    expect(result.questions[0]).toMatchObject({
      prompt: 'Hello, world?',
      questionType: 'multipleChoice',
      choices: ['X', 'Y'],
      correctIndices: [0],
    });
    expect(result.questions[1].correctIndices).toEqual([0, 2]);
    expect(result.questions[2]).toMatchObject({
      questionType: 'shortAnswer',
      answerMode: 'exact',
      expectedAnswer: '-2.5',
    });
    expect(result.questions[3]).toMatchObject({
      answerMode: 'range',
      minimumAnswer: '1',
      maximumAnswer: '3',
    });
  });

  it('exports 1-based correct indices', () => {
    const csv = formQuestionsToCsv([mcQuestion({ choices: ['A', 'B', 'C'], correctIndices: [0, 2] })]);
    expect(csv).toContain('1,3');
  });

  it('imports empty bank when only headers are present', () => {
    const result = csvToFormQuestions(serializeCsv([[...QUIZ_CSV_HEADERS]]));
    expect(result).toEqual({ ok: true, questions: [] });
  });

  it('rejects unknown type', () => {
    const csv = serializeCsv([
      [...QUIZ_CSV_HEADERS],
      ['essay', 'Write a lot', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ]);
    const result = csvToFormQuestions(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Row 2.*type must be/i);
  });

  it('rejects too few choices', () => {
    const csv = serializeCsv([
      [...QUIZ_CSV_HEADERS],
      ['multipleChoice', 'Only one', 'A', '', '', '', '', '', '', '', '1', '', '', '', ''],
    ]);
    const result = csvToFormQuestions(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Row 2.*2 and 8 choices/i);
  });

  it('rejects out-of-range correct indices', () => {
    const csv = serializeCsv([
      [...QUIZ_CSV_HEADERS],
      ['multipleChoice', 'Pick', 'A', 'B', '', '', '', '', '', '', '3', '', '', '', ''],
    ]);
    const result = csvToFormQuestions(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Row 2.*out of range/i);
  });

  it('rejects invalid short-answer range', () => {
    const csv = serializeCsv([
      [...QUIZ_CSV_HEADERS],
      ['shortAnswer', 'Bad range', '', '', '', '', '', '', '', '', '', 'range', '', '10', '5'],
    ]);
    const result = csvToFormQuestions(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Row 2.*minimum must be less than or equal/i);
  });

  it('does not partially apply when any row is invalid', () => {
    const csv = serializeCsv([
      [...QUIZ_CSV_HEADERS],
      ['multipleChoice', 'Good', 'A', 'B', '', '', '', '', '', '', '1', '', '', '', ''],
      ['multipleChoice', 'Bad', 'A', '', '', '', '', '', '', '', '1', '', '', '', ''],
    ]);
    const result = csvToFormQuestions(csv);
    expect(result.ok).toBe(false);
  });

  it('rejects empty CSV', () => {
    expect(csvToFormQuestions('')).toEqual({ ok: false, errors: ['CSV is empty.'] });
  });

  it('rejects missing required columns', () => {
    const result = csvToFormQuestions('type,prompt\nmultipleChoice,Hi');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/Missing required column/);
  });
});
