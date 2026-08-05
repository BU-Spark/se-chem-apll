import {
  combineTimestampParts,
  formatTimeOffsetSeconds,
  splitTimeOffsetSeconds,
  validateCheckpointTimestamps,
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

  it('formats seconds as m:ss', () => {
    expect(formatTimeOffsetSeconds(0)).toBe('0:00');
    expect(formatTimeOffsetSeconds(125)).toBe('2:05');
  });

  describe('validateCheckpointTimestamps', () => {
    it('accepts unique non-negative timestamps', () => {
      expect(
        validateCheckpointTimestamps([{ timeOffsetSeconds: 0 }, { timeOffsetSeconds: 90 }, { timeOffsetSeconds: 125 }])
      ).toBeNull();
    });

    it('rejects missing timestamps', () => {
      expect(validateCheckpointTimestamps([{}])).toBe(
        'Each checkpoint must have a non-negative whole-second timestamp.'
      );
      expect(validateCheckpointTimestamps([{ timeOffsetSeconds: null }])).toBe(
        'Each checkpoint must have a non-negative whole-second timestamp.'
      );
    });

    it('rejects duplicate timestamps', () => {
      expect(validateCheckpointTimestamps([{ timeOffsetSeconds: 90 }, { timeOffsetSeconds: 90 }])).toBe(
        'Checkpoint timestamps must be unique within a node.'
      );
    });

    it.each([-1, 1.5, Number.NaN])('rejects invalid timestamp %p', (timeOffsetSeconds) => {
      expect(validateCheckpointTimestamps([{ timeOffsetSeconds }])).toBe(
        'Each checkpoint must have a non-negative whole-second timestamp.'
      );
    });
  });
});
