// type guard for quiz question count
export function isValidQuizQuestionCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

// calcualtes how many questions you can actually use in the quiz by compared to the bank size
export function effectiveQuizQuestionCount(requested: number, bankSize: number): number {
  if (bankSize <= 0) return 0;
  return Math.min(requested, bankSize);
}

// random shuffling so we give the student a new set from the bank each time
export function pickRandomQuizQuestions<T>(bank: T[], requestedCount: number): T[] {
  const count = effectiveQuizQuestionCount(requestedCount, bank.length);
  if (count === 0) return [];

  const shuffled = [...bank];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
