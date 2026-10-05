import { generateClientId } from '@/lib/generateClientId';

/**
 * Authoring model for quiz-bank questions.
 *
 * This is the single in-memory representation used by the question browser,
 * detail editor, bulk actions, and CSV import. It intentionally differs from
 * both the CSV row shape (choice_1...choice_8) and the Prisma payload shape
 * (options JSON + correctIndices); adapters live in ./adapters.ts and
 * app/utils/questionBankCsv.ts.
 */

export type AuthoringChoice = {
  id: string;
  content: string;
  correct: boolean;
};

export type MultipleChoiceQuestion = {
  id: string;
  type: 'multipleChoice';
  prompt: string;
  choices: AuthoringChoice[];
};

export type ExactAnswer = { mode: 'exact'; expected: string };
export type RangeAnswer = { mode: 'range'; minimum: string; maximum: string };

export type ShortAnswerQuestion = {
  id: string;
  type: 'shortAnswer';
  prompt: string;
  /** Raw input strings are kept so partial values like "1e-" survive editing. */
  answer: ExactAnswer | RangeAnswer;
};

export type AuthoringQuestion = MultipleChoiceQuestion | ShortAnswerQuestion;

export const MAX_CHOICES = 8;
export const MIN_CHOICES = 2;

export function makeChoice(content = '', correct = false, id = generateClientId('choice')): AuthoringChoice {
  return { id, content, correct };
}

export function makeMultipleChoiceQuestion(id = generateClientId('question')): MultipleChoiceQuestion {
  return {
    id,
    type: 'multipleChoice',
    prompt: '',
    choices: [makeChoice(), makeChoice()],
  };
}

export function makeShortAnswerQuestion(id = generateClientId('question')): ShortAnswerQuestion {
  return {
    id,
    type: 'shortAnswer',
    prompt: '',
    answer: { mode: 'exact', expected: '' },
  };
}

export function duplicateQuestion(q: AuthoringQuestion, id = generateClientId('question')): AuthoringQuestion {
  if (q.type === 'multipleChoice') {
    return {
      ...q,
      id,
      choices: q.choices.map((choice) => ({ ...choice, id: generateClientId('choice') })),
    };
  }
  return { ...q, id, answer: { ...q.answer } };
}
