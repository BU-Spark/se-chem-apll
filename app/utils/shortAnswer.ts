export type ParsedShortAnswer =
  | { type: 'shortAnswer'; answerMode: 'exact'; expectedAnswer: number }
  | { type: 'shortAnswer'; answerMode: 'range'; minimumAnswer: number; maximumAnswer: number };

export interface ShortAnswerQuestionInput {
  options: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseShortAnswerOptions(options: unknown): ParsedShortAnswer | null {
  if (!options || typeof options !== 'object') return null;

  const value = options as {
    type?: unknown;
    answerMode?: unknown;
    expectedAnswer?: unknown;
    minimumAnswer?: unknown;
    maximumAnswer?: unknown;
    tolerancePercent?: unknown;
  };
  if (value.type !== 'shortAnswer') return null;

  if (value.answerMode === 'exact' && isFiniteNumber(value.expectedAnswer)) {
    return { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: value.expectedAnswer };
  }

  if (
    value.answerMode === 'range' &&
    isFiniteNumber(value.minimumAnswer) &&
    isFiniteNumber(value.maximumAnswer) &&
    value.minimumAnswer <= value.maximumAnswer
  ) {
    return {
      type: 'shortAnswer',
      answerMode: 'range',
      minimumAnswer: value.minimumAnswer,
      maximumAnswer: value.maximumAnswer,
    };
  }

  if (
    value.answerMode === undefined &&
    isFiniteNumber(value.expectedAnswer) &&
    isFiniteNumber(value.tolerancePercent) &&
    value.tolerancePercent >= 0
  ) {
    if (value.tolerancePercent === 0) {
      return { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: value.expectedAnswer };
    }

    const tolerance = Math.abs(value.expectedAnswer) * (value.tolerancePercent / 100);
    const minimumAnswer = value.expectedAnswer - tolerance;
    const maximumAnswer = value.expectedAnswer + tolerance;
    if (!Number.isFinite(minimumAnswer) || !Number.isFinite(maximumAnswer)) {
      return null;
    }
    return {
      type: 'shortAnswer',
      answerMode: 'range',
      minimumAnswer,
      maximumAnswer,
    };
  }

  return null;
}

export function validateShortAnswerOptions(questions: ShortAnswerQuestionInput[]): string | null {
  for (const question of questions) {
    if (!question.options || typeof question.options !== 'object') continue;
    const value = question.options as {
      type?: unknown;
      answerMode?: unknown;
      minimumAnswer?: unknown;
      maximumAnswer?: unknown;
    };
    if (value.type !== 'shortAnswer') continue;

    if (value.answerMode !== 'exact' && value.answerMode !== 'range') {
      return 'Each short-answer question must use exact or range mode.';
    }
    if (
      value.answerMode === 'range' &&
      isFiniteNumber(value.minimumAnswer) &&
      isFiniteNumber(value.maximumAnswer) &&
      value.minimumAnswer > value.maximumAnswer
    ) {
      return 'Short-answer minimum must be less than or equal to the maximum.';
    }
    if (!parseShortAnswerOptions(question.options)) {
      return 'Short-answer values must be valid finite numbers.';
    }
  }

  return null;
}

export function gradeShortAnswer(options: unknown, rawAnswer: unknown): boolean | null {
  const format = parseShortAnswerOptions(options);
  const text = String(rawAnswer ?? '').trim();
  if (!format || text === '') return null;

  const submitted = Number(text);
  if (!Number.isFinite(submitted)) return false;

  if (format.answerMode === 'exact') {
    return submitted === format.expectedAnswer;
  }
  return submitted >= format.minimumAnswer && submitted <= format.maximumAnswer;
}
