import { gradeShortAnswer, parseShortAnswerOptions, validateShortAnswerOptions } from './shortAnswer';

describe('short-answer helpers', () => {
  it('parses explicit exact and inclusive range modes', () => {
    expect(parseShortAnswerOptions({ type: 'shortAnswer', answerMode: 'exact', expectedAnswer: -2.5 })).toEqual({
      type: 'shortAnswer',
      answerMode: 'exact',
      expectedAnswer: -2.5,
    });
    expect(
      parseShortAnswerOptions({
        type: 'shortAnswer',
        answerMode: 'range',
        minimumAnswer: -5,
        maximumAnswer: 2.5,
      })
    ).toEqual({ type: 'shortAnswer', answerMode: 'range', minimumAnswer: -5, maximumAnswer: 2.5 });
  });

  it('converts legacy tolerance formats', () => {
    expect(parseShortAnswerOptions({ type: 'shortAnswer', expectedAnswer: 100, tolerancePercent: 0 })).toEqual({
      type: 'shortAnswer',
      answerMode: 'exact',
      expectedAnswer: 100,
    });
    expect(parseShortAnswerOptions({ type: 'shortAnswer', expectedAnswer: 100, tolerancePercent: 5 })).toEqual({
      type: 'shortAnswer',
      answerMode: 'range',
      minimumAnswer: 95,
      maximumAnswer: 105,
    });
  });

  it('validates explicit formats and reversed ranges', () => {
    expect(
      validateShortAnswerOptions([{ options: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 42 } }])
    ).toBeNull();
    expect(
      validateShortAnswerOptions([
        {
          options: { type: 'shortAnswer', answerMode: 'range', minimumAnswer: 10, maximumAnswer: 5 },
        },
      ])
    ).toBe('Short-answer minimum must be less than or equal to the maximum.');
  });

  it('grades exact answers and inclusive ranges', () => {
    const exact = { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 2.5 };
    expect(gradeShortAnswer(exact, '2.5')).toBe(true);
    expect(gradeShortAnswer(exact, '2.6')).toBe(false);

    const range = { type: 'shortAnswer', answerMode: 'range', minimumAnswer: -2, maximumAnswer: 2 };
    expect(gradeShortAnswer(range, '-2')).toBe(true);
    expect(gradeShortAnswer(range, '0')).toBe(true);
    expect(gradeShortAnswer(range, '2')).toBe(true);
    expect(gradeShortAnswer(range, '2.1')).toBe(false);
  });
});
