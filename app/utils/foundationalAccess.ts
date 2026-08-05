export type PreQuizOutcome = 'not_taken' | 'passed' | 'failed';

export type FoundationalAccess = {
  showPreQuiz: boolean;
  qevRequired: boolean;
  qevSkipped: boolean;
  qevLocked: boolean;
};

type AttemptLike = {
  isPassing: boolean | null;
  completedAt: Date | null;
  responses: {
    question: {
      isPreLecture: boolean;
    };
  }[];
};

/** Latest completed attempt that includes at least one pre-lecture answer. */
export function getPreQuizOutcome(attempts: AttemptLike[]): PreQuizOutcome {
  const preAttempt = attempts.find(
    (attempt) => attempt.completedAt !== null && attempt.responses.some((response) => response.question.isPreLecture)
  );

  if (!preAttempt) return 'not_taken';
  if (preAttempt.isPassing === true) return 'passed';
  if (preAttempt.isPassing === false) return 'failed';
  return 'not_taken';
}

/**
 * Foundational nodes: pre-quiz can skip QEV on pass.
 * Non-foundational: QEV always required; pre-quiz is not a skip gate.
 */
export function getFoundationalAccess(input: {
  isFoundational: boolean;
  hasPreQuiz: boolean;
  preQuizOutcome: PreQuizOutcome;
}): FoundationalAccess {
  const { isFoundational, hasPreQuiz, preQuizOutcome } = input;

  if (!isFoundational) {
    return {
      showPreQuiz: false,
      qevRequired: true,
      qevSkipped: false,
      qevLocked: false,
    };
  }

  if (!hasPreQuiz) {
    return {
      showPreQuiz: false,
      qevRequired: true,
      qevSkipped: false,
      qevLocked: false,
    };
  }

  if (preQuizOutcome === 'passed') {
    return {
      showPreQuiz: true,
      qevRequired: false,
      qevSkipped: true,
      qevLocked: false,
    };
  }

  if (preQuizOutcome === 'failed') {
    return {
      showPreQuiz: true,
      qevRequired: true,
      qevSkipped: false,
      qevLocked: false,
    };
  }

  // foundational + pre-quiz not taken yet
  return {
    showPreQuiz: true,
    qevRequired: true,
    qevSkipped: false,
    qevLocked: true,
  };
}
