import { getFoundationalAccess, getPreQuizOutcome } from './foundationalAccess';

describe('getPreQuizOutcome', () => {
  it('returns not_taken when there are no completed pre-quiz attempts', () => {
    expect(getPreQuizOutcome([])).toBe('not_taken');
  });

  it('returns passed for a completed passing pre-quiz attempt', () => {
    expect(
      getPreQuizOutcome([
        {
          isPassing: true,
          completedAt: new Date(),
          responses: [{ question: { isPreLecture: true } }],
        },
      ])
    ).toBe('passed');
  });

  it('returns failed for a completed failing pre-quiz attempt', () => {
    expect(
      getPreQuizOutcome([
        {
          isPassing: false,
          completedAt: new Date(),
          responses: [{ question: { isPreLecture: true } }],
        },
      ])
    ).toBe('failed');
  });
});

describe('getFoundationalAccess', () => {
  it('always requires QEV when not foundational', () => {
    expect(
      getFoundationalAccess({
        isFoundational: false,
        hasPreQuiz: true,
        preQuizOutcome: 'passed',
      })
    ).toEqual({
      showPreQuiz: false,
      qevRequired: true,
      qevSkipped: false,
      qevLocked: false,
    });
  });

  it('locks QEV until foundational pre-quiz is taken', () => {
    expect(
      getFoundationalAccess({
        isFoundational: true,
        hasPreQuiz: true,
        preQuizOutcome: 'not_taken',
      })
    ).toEqual({
      showPreQuiz: true,
      qevRequired: true,
      qevSkipped: false,
      qevLocked: true,
    });
  });

  it('skips QEV when foundational pre-quiz is passed', () => {
    expect(
      getFoundationalAccess({
        isFoundational: true,
        hasPreQuiz: true,
        preQuizOutcome: 'passed',
      })
    ).toEqual({
      showPreQuiz: true,
      qevRequired: false,
      qevSkipped: true,
      qevLocked: false,
    });
  });

  it('requires QEV when foundational pre-quiz is failed', () => {
    expect(
      getFoundationalAccess({
        isFoundational: true,
        hasPreQuiz: true,
        preQuizOutcome: 'failed',
      })
    ).toEqual({
      showPreQuiz: true,
      qevRequired: true,
      qevSkipped: false,
      qevLocked: false,
    });
  });
});
