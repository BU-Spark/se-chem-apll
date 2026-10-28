export interface MultipleChoiceQuestionInput {
  options: unknown;
  correctIndices?: unknown;
}

export function getMultipleChoiceChoices(options: unknown): string[] | null {
  if (Array.isArray(options) && options.every((choice) => typeof choice === 'string')) {
    return options;
  }

  if (options && typeof options === 'object') {
    const value = options as { type?: unknown; choices?: unknown };
    if (value.type === 'multipleChoice' && Array.isArray(value.choices)) {
      return value.choices.map((choice) => String(choice));
    }
  }

  return null;
}

export function validateMultipleChoiceAnswers(questions: MultipleChoiceQuestionInput[]): string | null {
  for (const question of questions) {
    const choices = getMultipleChoiceChoices(question.options);
    if (!choices) continue;

    if (choices.length < 2 || choices.length > 8) {
      return 'Multiple-choice questions must have between two and eight choices.';
    }

    const correctIndices = question.correctIndices;
    if (!Array.isArray(correctIndices) || correctIndices.length === 0) {
      return 'Each multiple-choice question must have at least one correct answer.';
    }

    const seen = new Set<number>();
    for (const index of correctIndices) {
      if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
        return 'Correct answer selections must reference an available choice.';
      }
      if (seen.has(index)) {
        return 'Correct answer selections must be unique.';
      }
      seen.add(index);
    }
  }

  return null;
}

export function areIndexSetsEqual(first: number[], second: number[]): boolean {
  if (first.length !== second.length) return false;
  const firstSet = new Set(first);
  if (firstSet.size !== first.length || new Set(second).size !== second.length) return false;
  return second.every((index) => firstSet.has(index));
}
