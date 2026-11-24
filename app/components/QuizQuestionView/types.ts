// A question as the team's attempt API returns it: no answers, choices null for numeric questions.
export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[] | null;
  // More than one choice is correct ("Select all that apply").
  allowsMultiple: boolean;
}

// notSure is "I'm Not Sure", graded as wrong by the server.
export type QuizAnswer = { selectedIndices: number[] } | { rawAnswer: string } | { notSure: true };

export function isAnswered(answer: QuizAnswer | undefined): boolean {
  if (!answer) return false;
  if ('notSure' in answer) return true;
  if ('selectedIndices' in answer) return answer.selectedIndices.length > 0;
  return answer.rawAnswer.trim() !== '' && Number.isFinite(Number(answer.rawAnswer));
}
