import { effectiveQuizQuestionCount, isValidQuizQuestionCount } from './quizQuestionCount';

describe('isValidQuizQuestionCount', () => {
  it.each([0, 1, 12])('accepts %p', (value) => {
    expect(isValidQuizQuestionCount(value)).toBe(true);
  });

  it.each([-1, 1.5, null, undefined, '', '3', Number.NaN])('rejects %p', (value) => {
    expect(isValidQuizQuestionCount(value)).toBe(false);
  });
});

describe('effectiveQuizQuestionCount', () => {
  it('returns 0 when the bank is empty', () => {
    expect(effectiveQuizQuestionCount(5, 0)).toBe(0);
  });

  it('returns requested when it is within the bank', () => {
    expect(effectiveQuizQuestionCount(3, 10)).toBe(3);
  });

  it('clamps to bank size when requested is larger', () => {
    expect(effectiveQuizQuestionCount(15, 12)).toBe(12);
  });
});
