import { getMultipleChoiceChoices } from './multipleChoice';
import { parseShortAnswerOptions } from './shortAnswer';

// A quiz question as the student sees it: no correct answers or short-answer bounds.
export type StudentQuizQuestion =
  | { id: string; prompt: string; type: 'multipleChoice'; choices: string[]; allowsMultiple: boolean }
  | { id: string; prompt: string; type: 'shortAnswer' };

export function toStudentQuizQuestion(question: {
  id: string;
  prompt: string;
  options: unknown;
  correctIndices: number[];
}): StudentQuizQuestion | null {
  const choices = getMultipleChoiceChoices(question.options);
  if (choices) {
    return {
      id: question.id,
      prompt: question.prompt,
      type: 'multipleChoice',
      choices,
      allowsMultiple: question.correctIndices.length > 1,
    };
  }
  if (parseShortAnswerOptions(question.options)) {
    return { id: question.id, prompt: question.prompt, type: 'shortAnswer' };
  }
  return null;
}
