import { getMultipleChoiceChoices, validateMultipleChoiceAnswers } from '@/app/utils/multipleChoice';
import { validateShortAnswerOptions } from '@/app/utils/shortAnswer';
import { validateCheckpointTimestamps } from '@/app/utils/questionTimestamps';

export type QuestionPayload = {
  sortOrder: number;
  prompt: string;
  options: unknown;
  correctIndices?: unknown;
};

export type CheckpointPayload = {
  sortOrder: number;
  timeOffsetSeconds: number;
  questions?: QuestionPayload[];
};

export type NodeContentPayload = {
  checkpoints?: CheckpointPayload[];
  quizQuestions?: QuestionPayload[];
};

export const nodeInclude = {
  checkpoints: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      questions: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
  quizQuestions: { orderBy: { sortOrder: 'asc' as const } },
};

export function flattenQuestionPayloads(payload: NodeContentPayload): QuestionPayload[] {
  const checkpointQuestions = (payload.checkpoints ?? []).flatMap((checkpoint) => checkpoint.questions ?? []);
  return [...checkpointQuestions, ...(payload.quizQuestions ?? [])];
}

export function validateNodeContent(payload: NodeContentPayload): string | null {
  const timestampError = validateCheckpointTimestamps(payload.checkpoints ?? []);
  if (timestampError) return timestampError;

  const questions = flattenQuestionPayloads(payload);
  const correctAnswersError = validateMultipleChoiceAnswers(questions);
  if (correctAnswersError) return correctAnswersError;

  const shortAnswerError = validateShortAnswerOptions(questions);
  if (shortAnswerError) return shortAnswerError;

  for (const checkpoint of payload.checkpoints ?? []) {
    if (!checkpoint.questions || checkpoint.questions.length === 0) {
      return 'Each checkpoint must include at least one question.';
    }
  }

  return null;
}

export function serializeQuestionCreate(q: QuestionPayload) {
  return {
    sortOrder: q.sortOrder,
    prompt: q.prompt,
    options: q.options as object,
    correctIndices: getMultipleChoiceChoices(q.options) ? (q.correctIndices as number[]) : [],
  };
}

export function serializeCheckpointCreate(checkpoint: CheckpointPayload) {
  return {
    sortOrder: checkpoint.sortOrder,
    timeOffsetSeconds: checkpoint.timeOffsetSeconds,
    questions: {
      create: (checkpoint.questions ?? []).map(serializeQuestionCreate),
    },
  };
}
