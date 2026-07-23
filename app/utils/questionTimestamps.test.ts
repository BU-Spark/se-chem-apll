import { combineTimestampParts, splitTimeOffsetSeconds, validateQuestionTimestamps } from './questionTimestamps';

describe('question timestamp helpers', () => {
  describe('combineTimestampParts', () => {
    it.each([
      ['0', '0', 0],
      ['1', '30', 90],
      ['12', '5', 725],
    ])('combines %s minutes and %s seconds', (minutes, seconds, expected) => {
      expect(combineTimestampParts(minutes, seconds)).toBe(expected);
    });

    it.each([
      ['', '0'],
      ['0', ''],
      ['-1', '0'],
      ['0', '-1'],
      ['0', '60'],
      ['1.5', '0'],
    ])('rejects invalid parts %s:%s', (minutes, seconds) => {
      expect(combineTimestampParts(minutes, seconds)).toBeNull();
    });
  });

  it('splits stored seconds for edit fields', () => {
    expect(splitTimeOffsetSeconds(125)).toEqual({ minutes: '2', seconds: '5' });
    expect(splitTimeOffsetSeconds(null)).toEqual({ minutes: '', seconds: '' });
  });

  describe('validateQuestionTimestamps', () => {
    it('accepts unique checkpoint timestamps and ignores pre-lecture timestamps', () => {
      expect(
        validateQuestionTimestamps([
          { isPreLecture: true, timeOffsetSeconds: 99 },
          { isPreLecture: false, timeOffsetSeconds: 0 },
          { isPreLecture: false, timeOffsetSeconds: 90 },
        ])
      ).toBeNull();
    });

    it('rejects missing timestamps', () => {
      expect(validateQuestionTimestamps([{ isPreLecture: false, timeOffsetSeconds: null }])).toBe(
        'Each checkpoint question must have a timestamp.'
      );
    });

    it.each([-1, 1.5, Number.NaN])('rejects invalid timestamp %p', (timeOffsetSeconds) => {
      expect(validateQuestionTimestamps([{ timeOffsetSeconds }])).toBe(
        'Checkpoint timestamps must be non-negative whole seconds.'
      );
    });

    it('rejects duplicate checkpoint timestamps', () => {
      expect(validateQuestionTimestamps([{ timeOffsetSeconds: 45 }, { timeOffsetSeconds: 45 }])).toBe(
        'Checkpoint timestamps must be unique.'
      );
    });
  });
});
