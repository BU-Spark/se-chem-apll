// type guard for quiz question count
export function isValidQuizQuestionCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

// calcualtes how many questions you can actually use in the quiz by compared to the bank size
export function effectiveQuizQuestionCount(requested: number, bankSize: number): number {
  if (bankSize <= 0) return 0;
  return Math.min(requested, bankSize);
}
