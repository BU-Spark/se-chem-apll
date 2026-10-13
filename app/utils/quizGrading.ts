import { areIndexSetsEqual, getMultipleChoiceChoices } from './multipleChoice';
import { gradeShortAnswer } from './shortAnswer';

export interface QuizAnswerInput {
  questionId: string;
  selectedIndices?: number[];
  rawAnswer?: string;
}

interface GradableQuestion {
  id: string;
  options: unknown;
  correctIndices: number[];
}

// Short answers must be plain numbers, e.g. "7", "-0.5", "6.02e23".
export function isNumberAnswer(text: string): boolean {
  return text.trim() !== '' && Number.isFinite(Number(text));
}

/**
 * Returns an error message if any question is unanswered or a short answer is not a number.
 */
export function validateQuizAnswers(questions: GradableQuestion[], answers: QuizAnswerInput[]): string | null {
  const answerById = new Map(answers.map((answer) => [answer.questionId, answer]));
  for (const question of questions) {
    const answer = answerById.get(question.id);
    if (getMultipleChoiceChoices(question.options)) {
      if (!answer?.selectedIndices?.length) return 'Every question must be answered.';
    } else if (!isNumberAnswer(answer?.rawAnswer ?? '')) {
      return 'Short answers must be numbers.';
    }
  }
  return null;
}

/**
 * Grades a quiz with the existing per-question utilities. Multi-answer questions are
 * all-or-nothing: the student must pick exactly the correct set.
 */
export function gradeQuizAttempt(questions: GradableQuestion[], answers: QuizAnswerInput[], passingPercent: number) {
  const answerById = new Map(answers.map((answer) => [answer.questionId, answer]));

  const responses = questions.map((question) => {
    const answer = answerById.get(question.id);
    if (getMultipleChoiceChoices(question.options)) {
      const selectedIndices = answer?.selectedIndices ?? [];
      return {
        questionId: question.id,
        selectedIndices,
        rawAnswer: null,
        isCorrect: areIndexSetsEqual(selectedIndices, question.correctIndices),
      };
    }
    const rawAnswer = (answer?.rawAnswer ?? '').trim();
    return {
      questionId: question.id,
      selectedIndices: [],
      rawAnswer,
      isCorrect: gradeShortAnswer(question.options, rawAnswer) === true,
    };
  });

  const correctCount = responses.filter((response) => response.isCorrect).length;
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 10000) / 100 : 0;

  return { responses, score, isPassing: score >= passingPercent };
}
