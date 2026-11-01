import { calculateLatePenalty, type LessonPolicy } from '@/app/utils/lessonSubmissionPolicy';
import { areIndexSetsEqual, getMultipleChoiceChoices } from '@/app/utils/multipleChoice';
import { gradeShortAnswer, parseShortAnswerOptions } from '@/app/utils/shortAnswer';
export type QuestionSnapshot = {
  id: string;
  prompt: string;
  options: unknown;
  correctIndices: number[];
  variantId?: string;
  variantValues?: Record<string, string>;
};
export type AnswerInput = { questionId: string; selectedIndices?: number[]; rawAnswer?: string };
export function gradeAnswer(question: QuestionSnapshot, answer: AnswerInput) {
  if (parseShortAnswerOptions(question.options)) {
    if (typeof answer.rawAnswer !== 'string' || !answer.rawAnswer.trim() || !Number.isFinite(Number(answer.rawAnswer)))
      throw new Error('Enter a valid numeric answer for every question.');
    return gradeShortAnswer(question.options, answer.rawAnswer) === true;
  }
  const choices = getMultipleChoiceChoices(question.options);
  if (!choices || !question.correctIndices.length) throw new Error('This question has no valid grading key.');
  const indices = answer.selectedIndices;
  if (
    !Array.isArray(indices) ||
    !indices.length ||
    indices.some((i) => !Number.isInteger(i) || i < 0 || i >= choices.length) ||
    new Set(indices).size !== indices.length
  )
    throw new Error('Select valid answers for every question.');
  return areIndexSetsEqual(indices, question.correctIndices);
}
export function lessonGrade(scores: number[], policy: LessonPolicy, submittedAt: Date) {
  if (scores.some((s) => !Number.isFinite(s) || s < 0 || s > 100)) throw new Error('Invalid quiz score.');
  const rawPercent = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const result = calculateLatePenalty(rawPercent ?? 0, policy, submittedAt);
  return {
    rawPercent,
    penaltyPercent: result.penaltyPercent,
    finalPercent: rawPercent === null ? null : result.finalScore,
  };
}
