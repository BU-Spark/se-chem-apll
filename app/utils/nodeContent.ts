import { getMultipleChoiceChoices, validateMultipleChoiceAnswers } from '@/app/utils/multipleChoice';
import { parseShortAnswerOptions, validateShortAnswerOptions } from '@/app/utils/shortAnswer';
import { validateCheckpointTimestamps } from '@/app/utils/questionTimestamps';

export type QuestionPayload = {
  sortOrder: number;
  prompt: string;
  options: unknown;
  correctIndices?: unknown;
};

export type CheckpointQuestionPayload = QuestionPayload & {
  kind?: unknown;
};

export type CheckpointPayload = {
  sortOrder: number;
  timeOffsetSeconds: number;
  questions?: CheckpointQuestionPayload[];
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
  const checkpointQuestions = (payload.checkpoints ?? []).flatMap((checkpoint) =>
    (checkpoint.questions ?? []).filter((question) => question.kind !== 'note')
  );
  return [...checkpointQuestions, ...(payload.quizQuestions ?? [])];
}

function validateSortOrders(sortOrders: number[], label: string): string | null {
  const seen = new Set<number>();
  for (const sortOrder of sortOrders) {
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      return `${label} sortOrder values must be non-negative integers.`;
    }
    if (seen.has(sortOrder)) {
      return `${label} sortOrder values must be unique.`;
    }
    seen.add(sortOrder);
  }
  return null;
}

function validateQuestionShape(question: QuestionPayload): string | null {
  if (typeof question.prompt !== 'string' || question.prompt.trim() === '') {
    return 'Each question must have a non-empty prompt.';
  }

  const isMultipleChoice = getMultipleChoiceChoices(question.options) !== null;
  const isShortAnswer = parseShortAnswerOptions(question.options) !== null;
  if (!isMultipleChoice && !isShortAnswer) {
    return 'Each question must use a supported multiple-choice or short-answer options shape.';
  }

  return null;
}

function checkpointItemKind(question: CheckpointQuestionPayload): 'question' | 'note' | null {
  if (question.kind === undefined || question.kind === 'question') return 'question';
  if (question.kind === 'note') return 'note';
  return null;
}

function validateCheckpointItemShape(question: CheckpointQuestionPayload): string | null {
  const kind = checkpointItemKind(question);
  if (!kind) return 'Checkpoint item kind must be question or note.';
  if (typeof question.prompt !== 'string' || question.prompt.trim() === '') {
    return kind === 'note' ? 'Each note must have non-empty text.' : 'Each question must have a non-empty prompt.';
  }
  if (kind === 'note') {
    if (
      question.correctIndices !== undefined &&
      (!Array.isArray(question.correctIndices) || question.correctIndices.length > 0)
    ) {
      return 'Notes cannot include correct answers.';
    }
    return null;
  }
  return validateQuestionShape(question);
}

export function validateNodeContent(payload: NodeContentPayload): string | null {
  const timestampError = validateCheckpointTimestamps(payload.checkpoints ?? []);
  if (timestampError) return timestampError;

  const checkpointSortError = validateSortOrders(
    (payload.checkpoints ?? []).map((checkpoint) => checkpoint.sortOrder),
    'Checkpoint'
  );
  if (checkpointSortError) return checkpointSortError;

  const quizSortError = validateSortOrders(
    (payload.quizQuestions ?? []).map((question) => question.sortOrder),
    'Quiz question'
  );
  if (quizSortError) return quizSortError;

  for (const checkpoint of payload.checkpoints ?? []) {
    if (!checkpoint.questions || checkpoint.questions.length === 0) {
      return 'Each checkpoint must include at least one question or note.';
    }

    const questionSortError = validateSortOrders(
      checkpoint.questions.map((question) => question.sortOrder),
      'Checkpoint question'
    );
    if (questionSortError) return questionSortError;

    for (const question of checkpoint.questions) {
      const shapeError = validateCheckpointItemShape(question);
      if (shapeError) return shapeError;
    }
  }

  for (const question of payload.quizQuestions ?? []) {
    if ((question as CheckpointQuestionPayload).kind === 'note') {
      return 'Quiz questions cannot be notes.';
    }
    const shapeError = validateQuestionShape(question);
    if (shapeError) return shapeError;
  }

  const questions = flattenQuestionPayloads(payload);
  const correctAnswersError = validateMultipleChoiceAnswers(questions);
  if (correctAnswersError) return correctAnswersError;

  const shortAnswerError = validateShortAnswerOptions(questions);
  if (shortAnswerError) return shortAnswerError;

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

export function serializeCheckpointQuestionCreate(q: CheckpointQuestionPayload) {
  const kind = checkpointItemKind(q);
  if (kind === 'note') {
    return {
      sortOrder: q.sortOrder,
      kind: 'NOTE' as const,
      prompt: q.prompt,
      options: { type: 'note' },
      correctIndices: [],
    };
  }
  return { ...serializeQuestionCreate(q), kind: 'QUESTION' as const };
}

export function serializeCheckpointCreate(checkpoint: CheckpointPayload) {
  return {
    sortOrder: checkpoint.sortOrder,
    timeOffsetSeconds: checkpoint.timeOffsetSeconds,
    questions: {
      create: (checkpoint.questions ?? []).map(serializeCheckpointQuestionCreate),
    },
  };
}
