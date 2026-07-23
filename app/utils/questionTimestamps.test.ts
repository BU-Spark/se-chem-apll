import {
  combineTimestampParts,
  splitTimeOffsetSeconds,
  validateQuestionTimestamps,
  validateTimestampParts,
} from './questionTimestamps';

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

  describe('validateTimestampParts', () => {
    it('accepts a complete timestamp or two blank fields', () => {
      expect(validateTimestampParts('1', '30')).toBeNull();
      expect(validateTimestampParts('', '')).toBeNull();
    });

    it.each([
      ['', '30'],
      ['1', ''],
    ])('rejects a partial timestamp %s:%s', (minutes, seconds) => {
      expect(validateTimestampParts(minutes, seconds)).toBe('Enter both minutes and seconds, or leave both blank.');
    });

    it.each([
      ['-1', '0'],
      ['0', '-1'],
      ['0', '60'],
      ['1.5', '0'],
    ])('rejects invalid timestamp parts %s:%s', (minutes, seconds) => {
      expect(validateTimestampParts(minutes, seconds)).toBe(
        'Timestamp minutes must be non-negative whole numbers and seconds must be between 0 and 59.'
      );
    });
  });

  it('splits stored seconds for edit fields', () => {
    expect(splitTimeOffsetSeconds(125)).toEqual({ minutes: '2', seconds: '5' });
    expect(splitTimeOffsetSeconds(null)).toEqual({ minutes: '', seconds: '' });
  });

  describe('validateQuestionTimestamps', () => {
    it('accepts missing and duplicate checkpoint timestamps and ignores pre-lecture timestamps', () => {
      expect(
        validateQuestionTimestamps([
          { isPreLecture: true, timeOffsetSeconds: 99 },
          { isPreLecture: false, timeOffsetSeconds: null },
          { isPreLecture: false },
          { isPreLecture: false, timeOffsetSeconds: 90 },
          { isPreLecture: false, timeOffsetSeconds: 90 },
        ])
      ).toBeNull();
    });

    it.each([-1, 1.5, Number.NaN])('rejects invalid timestamp %p', (timeOffsetSeconds) => {
      expect(validateQuestionTimestamps([{ timeOffsetSeconds }])).toBe(
        'Checkpoint timestamps must be non-negative whole seconds.'
      );
    });
  });
});
