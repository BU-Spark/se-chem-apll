import { getMultipleChoiceChoices } from '@/app/utils/multipleChoice';
import { parseShortAnswerOptions } from '@/app/utils/shortAnswer';
import {
  quizVariantOptions,
  renderQuestionVariant,
  type StoredVariant,
  type VariantAnswer,
} from '@/app/utils/questionVariants';
import type { QuestionPayload } from '@/app/utils/nodeContent';
import { makeChoice, makeMultipleChoiceQuestion, type AuthoringQuestion, type ShortAnswerQuestion } from './types';

export function answerToOptions(answer: ShortAnswerQuestion['answer']): VariantAnswer {
  const number = (value: string) => (value.trim() === '' ? null : Number(value));
  return answer.mode === 'exact'
    ? { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: number(answer.expected) }
    : {
        type: 'shortAnswer',
        answerMode: 'range',
        minimumAnswer: number(answer.minimum),
        maximumAnswer: number(answer.maximum),
      };
}

/**
 * Adapters between the authoring model and the existing API/Prisma payload
 * shape (shared options plus separate variant rows).
 */

export function dbQuestionToAuthoring(q: {
  id: string;
  prompt: string;
  options: unknown;
  correctIndices: number[];
  variants?: StoredVariant[];
}): AuthoringQuestion {
  const variants = quizVariantOptions(q);
  if (variants?.type === 'variantMultipleChoice')
    return {
      id: q.id,
      type: 'multipleChoice',
      prompt: q.prompt,
      choices: [],
      variants: variants.variants.map((row) => ({
        id: row.id,
        values: { ...row.values },
        answer: {
          type: 'multipleChoice',
          choices:
            variants.version === 1
              ? variants.choices!.map((c) => ({ ...c, content: renderQuestionVariant(c.content, row.values) }))
              : row.answer.choices!.map((c) => ({ ...c })),
          correctChoiceIds: [...row.answer.correctChoiceIds],
        },
      })),
    };
  if (variants?.type === 'variantShortAnswer') {
    return {
      id: q.id,
      type: 'shortAnswer',
      prompt: q.prompt,
      answer: { mode: 'exact', expected: '' },
      variants: variants.variants.map((row) => ({
        id: row.id,
        values: { ...row.values },
        answer: (
          dbQuestionToAuthoring({
            id: row.id,
            prompt: '',
            options: row.answer,
            correctIndices: [],
          }) as ShortAnswerQuestion
        ).answer,
      })),
    };
  }
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

  // Draft numeric answers may be deliberately blank; preserve their editor type.
  const draftOptions = q.options && typeof q.options === 'object' ? (q.options as Record<string, unknown>) : null;
  if (draftOptions?.type === 'shortAnswer') {
    const numberText = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
    return {
      id: q.id,
      type: 'shortAnswer',
      prompt: q.prompt,
      answer:
        draftOptions.answerMode === 'range'
          ? {
              mode: 'range',
              minimum: numberText(draftOptions.minimumAnswer),
              maximum: numberText(draftOptions.maximumAnswer),
            }
          : { mode: 'exact', expected: numberText(draftOptions.expectedAnswer) },
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
  if (q.variants) {
    return {
      sortOrder,
      prompt: q.prompt,
      correctIndices: [],
      options:
        q.type === 'multipleChoice'
          ? {
              type: 'variantMultipleChoice',
              version: 2,
            }
          : { type: 'variantShortAnswer', version: 1 },
      variants:
        q.type === 'multipleChoice'
          ? q.variants!.map((row) => ({
              ...row,
              values: { ...row.values },
              answer: {
                ...row.answer,
                choices: row.answer.choices?.map((c) => ({ ...c })) ?? [],
                correctChoiceIds: [...row.answer.correctChoiceIds],
              },
            }))
          : q.variants!.map((row) => ({ id: row.id, values: { ...row.values }, answer: answerToOptions(row.answer) })),
    };
  }
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
        expectedAnswer: q.answer.expected.trim() === '' ? null : Number(q.answer.expected),
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
      minimumAnswer: q.answer.minimum.trim() === '' ? null : Number(q.answer.minimum),
      maximumAnswer: q.answer.maximum.trim() === '' ? null : Number(q.answer.maximum),
    },
    correctIndices: [],
  };
}

/** Human-readable answer summary for the browser grid. */
export function summarizeAnswer(q: AuthoringQuestion): string {
  if (q.variants) return `${q.variants.length} variant${q.variants.length === 1 ? '' : 's'}`;
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
