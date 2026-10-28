import { parseShortAnswerOptions, type ParsedShortAnswer } from './shortAnswer';

export type VariantAnswer = {
  type: 'shortAnswer';
  answerMode: 'exact' | 'range';
  expectedAnswer?: number | null;
  minimumAnswer?: number | null;
  maximumAnswer?: number | null;
};
export type QuestionVariant = { id: string; values: Record<string, string>; answer: VariantAnswer };
export type VariantOptions = { type: 'variantShortAnswer'; version: 1; variants: QuestionVariant[] };

const tokenPattern = () => /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
export function questionVariables(prompt: string): string[] {
  return [...new Set(Array.from(prompt.matchAll(tokenPattern()), (match) => match[1]))];
}

export function renderQuestionVariant(prompt: string, values: Record<string, string>): string {
  return prompt.replace(tokenPattern(), (token, name: string) => (Object.hasOwn(values, name) ? values[name] : token));
}

export function isVariantOptions(options: unknown): options is VariantOptions {
  return !!options && typeof options === 'object' && 'type' in options && options.type === 'variantShortAnswer';
}

/** Drafts can contain empty cells, but never invalid structures or non-finite numbers. */
export function validateVariantOptions(prompt: string, options: unknown, draft = false): string | null {
  if (!isVariantOptions(options) || options.version !== 1 || !Array.isArray(options.variants))
    return 'Invalid question variants.';
  const variables = questionVariables(prompt);
  if (!draft && !variables.length) return 'Add a variable such as {{compound}} to the question prompt.';
  if (!draft && !options.variants.length) return 'Add at least one variant.';
  const ids = new Set<string>();
  for (const [index, row] of options.variants.entries()) {
    const prefix = `Variant ${index + 1}: `;
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || ids.has(row.id))
      return prefix + 'each row needs a unique ID.';
    ids.add(row.id);
    if (
      !row.values ||
      typeof row.values !== 'object' ||
      Array.isArray(row.values) ||
      Object.values(row.values).some((value) => typeof value !== 'string')
    )
      return prefix + 'variable values must be text.';
    if (!draft && variables.some((name) => !Object.hasOwn(row.values, name) || !row.values[name].trim()))
      return prefix + 'fill in every variable.';
    const answer = row.answer;
    if (!answer || answer.type !== 'shortAnswer' || !['exact', 'range'].includes(answer.answerMode))
      return prefix + 'choose an exact answer or an accepted range.';
    const numbers =
      answer.answerMode === 'exact' ? [answer.expectedAnswer] : [answer.minimumAnswer, answer.maximumAnswer];
    if (numbers.some((n) => !(draft && n === null) && (typeof n !== 'number' || !Number.isFinite(n))))
      return prefix + 'answers must be finite numbers.';
    if (
      answer.answerMode === 'range' &&
      typeof answer.minimumAnswer === 'number' &&
      typeof answer.maximumAnswer === 'number' &&
      answer.minimumAnswer > answer.maximumAnswer
    )
      return prefix + 'minimum cannot exceed maximum.';
  }
  return null;
}

/** Randomness is supplied by the server; previews and tests can select a particular row. */
export function resolveQuestionVariant(
  prompt: string,
  options: VariantOptions,
  index: number
): {
  prompt: string;
  options: ParsedShortAnswer;
  variantId: string;
  variantValues: Record<string, string>;
} {
  const error = validateVariantOptions(prompt, options);
  if (error) throw new Error(error);
  const row = options.variants[index];
  if (!row) throw new Error('Invalid variant selection.');
  return {
    prompt: renderQuestionVariant(prompt, row.values),
    options: parseShortAnswerOptions(row.answer)!,
    variantId: row.id,
    variantValues: { ...row.values },
  };
}

export type VariantChoice = { id: string; content: string };
export type MultipleChoiceVariant = {
  id: string;
  values: Record<string, string>;
  answer: { type: 'multipleChoice'; choices?: VariantChoice[]; correctChoiceIds: string[] };
};
export type MultipleChoiceVariantOptions = {
  type: 'variantMultipleChoice';
  version: 1 | 2;
  /** Version 1 only; version 2 stores choices in each row's answer. */
  choices?: VariantChoice[];
  variants: MultipleChoiceVariant[];
};
export type QuizVariantOptions = VariantOptions | MultipleChoiceVariantOptions;
export type StoredVariant = { id: string; sortOrder?: number; values: unknown; answer: unknown };

export function isQuizVariantOptions(options: unknown): options is QuizVariantOptions {
  return (
    isVariantOptions(options) ||
    (!!options && typeof options === 'object' && 'type' in options && options.type === 'variantMultipleChoice')
  );
}

/** Hydrate the shared template with ordered relational rows. Legacy JSON remains readable during migration. */
export function quizVariantOptions(question: {
  options: unknown;
  variants?: StoredVariant[];
}): QuizVariantOptions | null {
  if (!isQuizVariantOptions(question.options)) return null;
  return {
    ...question.options,
    variants: question.variants?.length ? question.variants : (question.options.variants ?? question.variants),
  } as QuizVariantOptions;
}

export function validateQuizVariants(prompt: string, options: QuizVariantOptions, draft = false): string | null {
  if (options.type === 'variantShortAnswer') return validateVariantOptions(prompt, options, draft);
  if (
    ![1, 2].includes(options.version) ||
    !Array.isArray(options.variants) ||
    (options.version === 1 && !Array.isArray(options.choices))
  )
    return 'Invalid MCQ variants.';
  if (!draft && !options.variants.length) return 'Add at least one variant.';
  const ids = new Set<string>();
  for (const [index, row] of options.variants.entries()) {
    const prefix = `Variant ${index + 1}: `;
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) return prefix + 'each row needs a unique ID.';
    ids.add(row.id);
    if (
      !row.values ||
      typeof row.values !== 'object' ||
      Array.isArray(row.values) ||
      Object.values(row.values).some((v) => typeof v !== 'string')
    )
      return prefix + 'variable values must be text.';
    const answer = row.answer;
    if (!answer || answer.type !== 'multipleChoice' || !Array.isArray(answer.correctChoiceIds))
      return prefix + 'select correct choices.';
    const choices = options.version === 1 ? options.choices : answer.choices;
    if (!Array.isArray(choices)) return prefix + 'choices must be an array.';
    if (choices.length > 8 || (!draft && choices.length < 2)) return prefix + 'Multiple choice needs 2–8 choices.';
    const choiceIds = new Set<string>();
    for (const choice of choices) {
      if (
        !choice ||
        typeof choice.id !== 'string' ||
        !choice.id ||
        choiceIds.has(choice.id) ||
        typeof choice.content !== 'string'
      )
        return prefix + 'Choices need unique IDs and text.';
      if (!draft && !choice.content.trim()) return prefix + 'Choice text is required.';
      choiceIds.add(choice.id);
    }
    const variables = questionVariables([prompt, ...choices.map((c) => c.content)].join('\n'));
    if (!draft && variables.some((name) => !Object.hasOwn(row.values, name) || !row.values[name].trim()))
      return prefix + 'fill in every variable.';
    if (
      new Set(answer.correctChoiceIds).size !== answer.correctChoiceIds.length ||
      answer.correctChoiceIds.some((id) => !choiceIds.has(id))
    )
      return prefix + 'correct answers must reference unique available choices.';
    if (!draft && !answer.correctChoiceIds.length) return prefix + 'select at least one correct choice.';
  }
  return null;
}

export function resolveQuizVariant(prompt: string, options: QuizVariantOptions, index: number) {
  const error = validateQuizVariants(prompt, options);
  if (error) throw new Error(error);
  if (options.type === 'variantShortAnswer')
    return { ...resolveQuestionVariant(prompt, options, index), correctIndices: [] as number[] };
  const row = options.variants[index];
  if (!row) throw new Error('Invalid variant selection.');
  return {
    prompt: renderQuestionVariant(prompt, row.values),
    options: {
      type: 'multipleChoice',
      choices: (options.version === 1 ? options.choices! : row.answer.choices!).map((c) =>
        renderQuestionVariant(c.content, row.values)
      ),
    },
    correctIndices: (options.version === 1 ? options.choices! : row.answer.choices!).flatMap((c, i) =>
      row.answer.correctChoiceIds.includes(c.id) ? [i] : []
    ),
    variantId: row.id,
    variantValues: { ...row.values },
  };
}

/** Upgrade the shared-choice wire format before saving or comparing quiz content. */
export function independentQuizVariants(options: QuizVariantOptions): QuizVariantOptions {
  if (options.type !== 'variantMultipleChoice' || options.version === 2) return options;
  return {
    type: 'variantMultipleChoice',
    version: 2,
    variants: options.variants.map((row) => ({
      ...row,
      answer: {
        ...row.answer,
        choices: options.choices!.map((choice) => ({
          ...choice,
          content: renderQuestionVariant(choice.content, row.values),
        })),
      },
    })),
  };
}
