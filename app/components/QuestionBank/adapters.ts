import { getMultipleChoiceChoices } from '@/app/utils/multipleChoice';
import { parseShortAnswerOptions } from '@/app/utils/shortAnswer';
import type { QuestionPayload } from '@/app/utils/nodeContent';
import { makeChoice, makeMultipleChoiceQuestion, type AuthoringQuestion } from './types';

/**
 * Adapters between the authoring model and the existing API/Prisma payload
 * shape (`{ sortOrder, prompt, options, correctIndices }`). The API contract
 * is unchanged; this keeps the UI free of `options` JSON details.
 */

export function dbQuestionToAuthoring(q: {
  id: string;
  prompt: string;
  options: unknown;
  correctIndices: number[];
}): AuthoringQuestion {
  const shortAnswer = parseShortAnswerOptions(q.options);
  if (shortAnswer) {
    return {
      id: q.id,
      type: 'shortAnswer',
      prompt: q.prompt,
      answer:
        shortAnswer.answerMode === 'exact'
          ? { mode: 'exact', expected: String(shortAnswer.expectedAnswer) }
          : {
              mode: 'range',
              minimum: String(shortAnswer.minimumAnswer),
              maximum: String(shortAnswer.maximumAnswer),
            },
    };
  }

  const choices = getMultipleChoiceChoices(q.options);
  if (choices) {
    const correct = new Set(q.correctIndices);
    return {
      id: q.id,
      type: 'multipleChoice',
      prompt: q.prompt,
      choices: choices
        .map((content) => makeChoice(content, false))
        .map((choice, idx) => ({
          ...choice,
          correct: correct.has(idx),
        })),
    };
  }

  // Unknown legacy shape: fall back to an editable multiple-choice draft.
  return { ...makeMultipleChoiceQuestion(q.id), prompt: q.prompt };
}

export function authoringQuestionToPayload(q: AuthoringQuestion, sortOrder: number): QuestionPayload {
  if (q.type === 'multipleChoice') {
    return {
      sortOrder,
      prompt: q.prompt,
      options: { type: 'multipleChoice', choices: q.choices.map((choice) => choice.content) },
      correctIndices: q.choices.flatMap((choice, idx) => (choice.correct ? [idx] : [])),
    };
  }

  if (q.answer.mode === 'exact') {
    return {
      sortOrder,
      prompt: q.prompt,
      options: {
        type: 'shortAnswer',
        answerMode: 'exact',
        expectedAnswer: Number(q.answer.expected),
      },
      correctIndices: [],
    };
  }

  return {
    sortOrder,
    prompt: q.prompt,
    options: {
      type: 'shortAnswer',
      answerMode: 'range',
      minimumAnswer: Number(q.answer.minimum),
      maximumAnswer: Number(q.answer.maximum),
    },
    correctIndices: [],
  };
}

/** Human-readable answer summary for the browser grid. */
export function summarizeAnswer(q: AuthoringQuestion): string {
  if (q.type === 'multipleChoice') {
    const correct = q.choices.filter((choice) => choice.correct).length;
    const choiceLabel = `${q.choices.length} choice${q.choices.length === 1 ? '' : 's'}`;
    const correctLabel = `${correct} correct`;
    return `${choiceLabel} · ${correctLabel}`;
  }
  if (q.answer.mode === 'exact') {
    return q.answer.expected.trim() === '' ? 'Exact: —' : `Exact: ${q.answer.expected}`;
  }
  const min = q.answer.minimum.trim() === '' ? '—' : q.answer.minimum;
  const max = q.answer.maximum.trim() === '' ? '—' : q.answer.maximum;
  return `Range: ${min} – ${max}`;
}
