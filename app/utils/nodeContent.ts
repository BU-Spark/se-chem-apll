import { getMultipleChoiceChoices, validateMultipleChoiceAnswers } from '@/app/utils/multipleChoice';
import { parseShortAnswerOptions, validateShortAnswerOptions } from '@/app/utils/shortAnswer';
import { validateCheckpointTimestamps } from '@/app/utils/questionTimestamps';
import {
  independentQuizVariants,
  isQuizVariantOptions,
  quizVariantOptions,
  validateQuizVariants,
  type StoredVariant,
} from './questionVariants';

export type QuestionPayload = {
  id?: string;
  sortOrder: number;
  prompt: string;
  options: unknown;
  correctIndices?: unknown;
  variants?: StoredVariant[];
};

export type CheckpointQuestionPayload = QuestionPayload & {
  kind?: unknown;
};

export type CheckpointPayload = {
  id?: string;
  checkpointKey?: string;
  placementHint?: string | null;
  sortOrder: number;
  timeOffsetSeconds: number | null;
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
  quizQuestions: {
    orderBy: { sortOrder: 'asc' as const },
    include: { variants: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

export function flattenQuestionPayloads(payload: NodeContentPayload): QuestionPayload[] {
  const checkpointQuestions = (payload.checkpoints ?? []).flatMap((checkpoint) =>
    (checkpoint.questions ?? []).filter((question) => checkpointItemKind(question) !== 'note')
  );
  return [...checkpointQuestions, ...(payload.quizQuestions ?? [])];
}

function validateSortOrders(sortOrders: number[], label: string): string | null {
  const seen = new Set<number>();
  for (const sortOrder of sortOrders) {
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 2147483647) {
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

  const variants = quizVariantOptions(question);
  if (variants) return validateQuizVariants(question.prompt, variants);

  const isMultipleChoice = getMultipleChoiceChoices(question.options) !== null;
  const isShortAnswer = parseShortAnswerOptions(question.options) !== null;
  if (!isMultipleChoice && !isShortAnswer) {
    return 'Each question must use a supported multiple-choice or short-answer options shape.';
  }

  return null;
}

function checkpointItemKind(question: CheckpointQuestionPayload): 'question' | 'note' | null {
  if (question.kind === undefined || question.kind === 'question' || question.kind === 'QUESTION') return 'question';
  if (question.kind === 'note' || question.kind === 'NOTE') return 'note';
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

export function validateNodeContent(payload: NodeContentPayload, mode: 'draft' | 'publish' = 'publish'): string | null {
  const structureError = validateNodeStructure(payload);
  if (structureError) return structureError;
  const timestampError = validateCheckpointTimestamps(payload.checkpoints ?? [], mode === 'draft');
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

  const keys = new Set<string>();
  for (const checkpoint of payload.checkpoints ?? []) {
    const key = checkpoint.checkpointKey?.trim() ?? `checkpoint-${checkpoint.sortOrder + 1}`;
    if (!key || keys.has(key)) return 'Checkpoint keys must be non-empty and unique within a node.';
    keys.add(key);
    const orderError = validateSortOrders(
      (checkpoint.questions ?? []).map((q) => q.sortOrder),
      'Checkpoint question'
    );
    if (orderError) return `${key}: ${orderError}`;
  }
  if (mode === 'draft') return null;

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
    if (checkpointItemKind(question as CheckpointQuestionPayload) === 'note') {
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
  const hydrated = quizVariantOptions(q);
  const variantOptions = hydrated ? independentQuizVariants(hydrated) : null;
  const options = variantOptions
    ? Object.fromEntries(
        Object.entries(variantOptions).filter(([key]) => key !== 'variants' && key !== 'legacyChoices')
      )
    : q.options;
  return {
    ...(variantOptions
      ? {
          variants: {
            create: variantOptions.variants.map((row, sortOrder) => ({
              id: row.id,
              sortOrder,
              values: row.values,
              answer: row.answer,
            })),
          },
        }
      : {}),
    sortOrder: q.sortOrder,
    prompt: q.prompt,
    options: options as object,
    correctIndices: getMultipleChoiceChoices(q.options) ? ((q.correctIndices ?? []) as number[]) : [],
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
    checkpointKey: checkpoint.checkpointKey?.trim() ?? `checkpoint-${checkpoint.sortOrder + 1}`,
    placementHint: checkpoint.placementHint?.trim() || null,
    questions: {
      create: (checkpoint.questions ?? []).map(serializeCheckpointQuestionCreate),
    },
  };
}

/** Drafts may be incomplete, but must always be safe to serialize and persist. */
function validateNodeStructure(payload: NodeContentPayload): string | null {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  for (const field of ['checkpoints', 'quizQuestions'] as const) {
    if (payload[field] !== undefined && !Array.isArray(payload[field])) return `${field} must be an array.`;
  }
  function itemError(value: unknown, notes: boolean): string | null {
    if (!object(value)) return 'Each item must be an object.';
    if (value.id !== undefined && (typeof value.id !== 'string' || !value.id)) return 'Invalid item ID.';
    if (typeof value.prompt !== 'string') return 'Item prompt must be text.';
    const kind = checkpointItemKind(value as CheckpointQuestionPayload);
    if (!kind || (!notes && kind === 'note')) return 'Unsupported item kind.';
    const indices = value.correctIndices === undefined ? [] : value.correctIndices;
    if (!Array.isArray(indices) || indices.some((n) => !Number.isInteger(n) || n < 0))
      return 'Correct answer selections must be an array of non-negative integers.';
    const options = value.options;
    if (notes && (isQuizVariantOptions(options) || value.variants !== undefined))
      return 'Question variants are only supported in the quiz bank.';
    if (isQuizVariantOptions(options)) {
      if (value.variants !== undefined && !Array.isArray(value.variants)) return 'Variants must be an array.';
      if (indices.length) return 'Variant answers must be specified per row.';
      return validateQuizVariants(value.prompt, quizVariantOptions(value as QuestionPayload)!, true);
    }
    if (value.variants !== undefined && (!Array.isArray(value.variants) || value.variants.length))
      return 'Variants require a variant question type.';
    if (kind === 'note') return indices.length ? 'Notes cannot include correct answers.' : null;
    const choices = Array.isArray(options)
      ? options
      : object(options) && options.type === 'multipleChoice'
        ? options.choices
        : null;
    if (choices !== null) {
      if (!Array.isArray(choices) || choices.length > 8 || choices.some((c) => typeof c !== 'string'))
        return 'Invalid multiple-choice options.';
      if (new Set(indices).size !== indices.length || indices.some((n) => n >= choices.length))
        return 'Correct answer selections must reference unique available choices.';
      return null;
    }
    if (indices.length) return 'Short-answer questions cannot include correct choice indices.';
    if (parseShortAnswerOptions(options)) return null;
    if (!object(options) || options.type !== 'shortAnswer' || !['exact', 'range'].includes(String(options.answerMode)))
      return 'Unsupported question options.';
    for (const field of options.answerMode === 'exact' ? ['expectedAnswer'] : ['minimumAnswer', 'maximumAnswer']) {
      if (options[field] !== null && (typeof options[field] !== 'number' || !Number.isFinite(options[field])))
        return `${field} must be a finite number or null in a draft.`;
    }
    if (
      options.answerMode === 'range' &&
      typeof options.minimumAnswer === 'number' &&
      typeof options.maximumAnswer === 'number' &&
      options.minimumAnswer > options.maximumAnswer
    )
      return 'Minimum answer cannot exceed maximum answer.';
    return null;
  }
  const ids = new Set<string>();
  const variantIds = new Set<string>();
  for (const checkpoint of payload.checkpoints ?? []) {
    if (!object(checkpoint)) return 'Each checkpoint must be an object.';
    if (checkpoint.id !== undefined) {
      if (typeof checkpoint.id !== 'string' || !checkpoint.id || ids.has(checkpoint.id))
        return 'Checkpoint IDs must be non-empty and unique.';
      ids.add(checkpoint.id);
    }
    if (checkpoint.checkpointKey !== undefined && typeof checkpoint.checkpointKey !== 'string')
      return 'Checkpoint key must be text.';
    if (checkpoint.placementHint != null && typeof checkpoint.placementHint !== 'string')
      return 'Placement hint must be text.';
    if (!Array.isArray(checkpoint.questions)) return 'Checkpoint questions must be an array.';
    for (const item of checkpoint.questions) {
      const error = itemError(item, true);
      if (error) return `${checkpoint.checkpointKey ?? 'Checkpoint'}: ${error}`;
      if (item.id) {
        if (ids.has(item.id)) return 'Item IDs must be unique.';
        ids.add(item.id);
      }
    }
  }
  for (const item of payload.quizQuestions ?? []) {
    const error = itemError(item, false);
    if (error) return error;
    for (const row of quizVariantOptions(item)?.variants ?? []) {
      if (variantIds.has(row.id)) return 'Variant IDs must be unique across quiz questions.';
      variantIds.add(row.id);
    }
  }
  return null;
}

/** Semantic comparison ignores JSON object key order and legacy answer encodings. */
export function questionContentKey(question: CheckpointQuestionPayload): string {
  const hydrated = quizVariantOptions(question);
  const variantOptions = hydrated ? independentQuizVariants(hydrated) : null;
  if (variantOptions)
    return JSON.stringify([
      variantOptions.type,
      question.prompt,
      variantOptions.type === 'variantMultipleChoice'
        ? (variantOptions.choices?.map((c) => [c.id, c.content]) ?? null)
        : null,
      variantOptions.variants.map((row) => [
        row.id,
        Object.entries(row.values).sort(([a], [b]) => a.localeCompare(b)),
        row.answer.type === 'multipleChoice'
          ? [(row.answer.choices ?? []).map((c) => [c.id, c.content]), [...row.answer.correctChoiceIds].sort()]
          : [
              row.answer.answerMode,
              row.answer.answerMode === 'exact'
                ? row.answer.expectedAnswer
                : [row.answer.minimumAnswer, row.answer.maximumAnswer],
            ],
      ]),
    ]);
  const kind = checkpointItemKind(question);
  if (kind === 'note') return JSON.stringify(['note', question.prompt]);
  const choices = getMultipleChoiceChoices(question.options);
  if (choices)
    return JSON.stringify([
      'multipleChoice',
      question.prompt,
      choices,
      [...((question.correctIndices ?? []) as number[])].sort((a, b) => a - b),
    ]);
  const shortAnswer = parseShortAnswerOptions(question.options);
  const options = shortAnswer ?? question.options;
  const sortedOptions =
    options && typeof options === 'object'
      ? Object.fromEntries(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)))
      : options;
  return JSON.stringify(['shortAnswer', question.prompt, sortedOptions]);
}
