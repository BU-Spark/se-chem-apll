import {
  calculateLatePenalty,
  emptyLessonSchedule,
  isLessonHidden,
  lessonPolicyData,
  schedulePayload,
  submissionStatus,
  toDateTimeInput,
  validateLessonPolicy,
  type LessonPolicyInput,
} from './lessonSubmissionPolicy';

const input: LessonPolicyInput = {
  openDate: '2026-10-01T00:00:00Z',
  dueDate: '2026-10-12T12:00:00Z',
  lateDeadline: '2026-10-15T12:00:00Z',
  hideAfterDue: false,
  latePenaltyType: 'HOURLY',
  latePenaltyPercent: 1,
};
const policy = lessonPolicyData(input);

describe('lesson submission policies', () => {
  it.each([
    ['2026-09-30T23:59:59Z', 'NOT_OPEN'],
    ['2026-10-01T00:00:00Z', 'ON_TIME'],
    ['2026-10-12T12:00:00Z', 'ON_TIME'],
    ['2026-10-12T12:00:00.001Z', 'LATE'],
    ['2026-10-15T12:00:00Z', 'LATE'],
    ['2026-10-15T12:00:00.001Z', 'CLOSED'],
  ])('classifies %s as %s', (time, expected) => expect(submissionStatus(policy, new Date(time))).toBe(expected));

  it('prorates a half hour and preserves the earned score', () => {
    const result = calculateLatePenalty(80, policy, new Date('2026-10-12T12:30:00Z'));
    expect(result.earnedScore).toBe(80);
    expect(result.penaltyPercent).toBe(0.5);
    expect(result.finalScore).toBeCloseTo(79.6);
  });
  it('uses the same elapsed-time calculation for daily and hourly rates', () => {
    const time = new Date('2026-10-13T00:00:00Z');
    expect(calculateLatePenalty(80, { ...policy, latePenaltyType: 'DAILY', latePenaltyPercent: 24 }, time)).toEqual(
      calculateLatePenalty(80, policy, time)
    );
  });
  it('applies a fixed deduction only once', () => {
    expect(
      calculateLatePenalty(
        80,
        { ...policy, latePenaltyType: 'FIXED', latePenaltyPercent: 10 },
        new Date('2026-10-14T12:00:00Z')
      ).finalScore
    ).toBe(72);
  });
  it('caps the deduction at 100 percent', () => {
    expect(
      calculateLatePenalty(80, { ...policy, latePenaltyPercent: 50 }, new Date('2026-10-14T12:00:00Z')).finalScore
    ).toBe(0);
  });
  it('does not penalize an on-time submission', () => {
    expect(calculateLatePenalty(80, policy, policy.dueDate!).finalScore).toBe(80);
  });
  it('accepts late submissions with no penalty', () => {
    expect(
      calculateLatePenalty(
        80,
        { ...policy, latePenaltyType: 'NONE', latePenaltyPercent: 0 },
        new Date('2026-10-13T12:00:00Z')
      ).finalScore
    ).toBe(80);
  });
  it('rejects a submission after the late deadline', () => {
    expect(() => calculateLatePenalty(80, policy, new Date('2026-10-16T00:00:00Z'))).toThrow('not accepted');
  });
  it('keeps review visibility separate from submission closure', () => {
    const time = new Date('2026-10-13T12:00:00Z');
    expect(submissionStatus({ ...policy, lateDeadline: null }, time)).toBe('CLOSED');
    expect(isLessonHidden(policy, time)).toBe(false);
    expect(isLessonHidden({ ...policy, hideAfterDue: true }, time)).toBe(true);
    expect(isLessonHidden({ ...policy, hideAfterDue: true }, policy.dueDate!)).toBe(false);
  });
  it.each([
    { dueDate: 'invalid' },
    { dueDate: '2026-10-12T12:00' },
    { dueDate: '2026-09-01T00:00:00Z' },
    { dueDate: null },
    { lateDeadline: input.dueDate },
    { hideAfterDue: true },
    { latePenaltyPercent: -1 },
    { latePenaltyPercent: 101 },
    { latePenaltyPercent: NaN },
    { lateDeadline: null },
    { latePenaltyType: 'NONE', latePenaltyPercent: 1 },
    { latePenaltyType: 'INVALID' },
    { latePenaltyPercent: '5' },
  ])('rejects invalid settings %j', (patch) => {
    expect(validateLessonPolicy({ ...input, ...patch } as LessonPolicyInput)).not.toBeNull();
  });
  it('allows no dates with no penalty', () => expect(validateLessonPolicy({})).toBeNull());
  it('defaults new assignments to visible and accepts late windows without a visibility override', () => {
    expect(emptyLessonSchedule.hideAfterDue).toBe(false);
    expect(lessonPolicyData({}).hideAfterDue).toBe(false);
    expect(validateLessonPolicy({ ...input, hideAfterDue: undefined })).toBeNull();
    expect(lessonPolicyData({ hideAfterDue: true }).hideAfterDue).toBe(true);
  });
  it('validates a daily policy', () => expect(validateLessonPolicy({ ...input, latePenaltyType: 'DAILY' })).toBeNull());
  it('round trips existing timestamps through the UTC editor without truncation', () => {
    const date = new Date('2026-10-12T14:32:12.123Z');
    const payload = schedulePayload({ ...emptyLessonSchedule, dueDate: toDateTimeInput(date) });
    expect(payload.dueDate).toBe(date.toISOString());
    expect(validateLessonPolicy(payload)).toBeNull();
  });
});
