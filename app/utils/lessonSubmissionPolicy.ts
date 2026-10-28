export type LatePenaltyType = 'NONE' | 'FIXED' | 'HOURLY' | 'DAILY';

export interface LessonPolicyInput {
  openDate?: string | null;
  dueDate?: string | null;
  lateDeadline?: string | null;
  hideAfterDue?: boolean;
  latePenaltyType?: LatePenaltyType;
  latePenaltyPercent?: number;
}

export interface LessonPolicy {
  openDate: Date | null;
  dueDate: Date | null;
  lateDeadline: Date | null;
  hideAfterDue: boolean;
  latePenaltyType: LatePenaltyType;
  latePenaltyPercent: number;
}

function isValidPolicyDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second = '0'] = parts;
  const leapYear = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    Number(day) >= 1 &&
    Number(day) <= days[Number(month) - 1] &&
    Number(hour) < 24 &&
    Number(minute) < 60 &&
    Number(second) < 60
  );
}

/** Shared by the forms and API; API dates must include an explicit timezone. */
export function validateLessonPolicy(input: LessonPolicyInput): string | null {
  for (const [label, value] of [
    ['Open date', input.openDate],
    ['Due date', input.dueDate],
    ['Late submission deadline', input.lateDeadline],
  ] as const) {
    if (value != null && !isValidPolicyDate(value)) {
      return `${label} must be a valid date and time with a timezone.`;
    }
  }
  if (input.hideAfterDue !== undefined && typeof input.hideAfterDue !== 'boolean')
    return 'Hide lesson after due date must be a boolean.';
  if (input.openDate && input.dueDate && Date.parse(input.openDate) >= Date.parse(input.dueDate))
    return 'Open date must be before due date';
  if (input.lateDeadline && (!input.dueDate || Date.parse(input.lateDeadline) <= Date.parse(input.dueDate)))
    return 'Late submission deadline must be after the due date.';
  if (input.lateDeadline && (input.hideAfterDue ?? false))
    return 'Uncheck Hide lesson after due date to accept late submissions.';
  const type = input.latePenaltyType ?? 'NONE';
  if (!['NONE', 'FIXED', 'HOURLY', 'DAILY'].includes(type)) return 'Invalid late penalty policy.';
  const rate = input.latePenaltyPercent ?? 0;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100)
    return 'Penalty must be between 0 and 100 percent.';
  if (type !== 'NONE' && (!input.lateDeadline || rate <= 0))
    return 'A penalty requires a late submission deadline and a percentage greater than zero.';
  if (type === 'NONE' && rate !== 0) return 'No penalty must have a zero percentage.';
  return null;
}

export function lessonPolicyData(input: LessonPolicyInput): LessonPolicy {
  return {
    openDate: input.openDate ? new Date(input.openDate) : null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    lateDeadline: input.lateDeadline ? new Date(input.lateDeadline) : null,
    hideAfterDue: input.hideAfterDue ?? false,
    latePenaltyType: input.latePenaltyType ?? 'NONE',
    latePenaltyPercent: input.latePenaltyPercent ?? 0,
  };
}

export function isLessonHidden(policy: Pick<LessonPolicy, 'hideAfterDue' | 'dueDate'>, now: Date): boolean {
  return policy.hideAfterDue && policy.dueDate !== null && now > policy.dueDate;
}

/** Call with server submission time and the specific course assignment when submissions are implemented. */
export function submissionStatus(policy: LessonPolicy, submittedAt: Date): 'NOT_OPEN' | 'ON_TIME' | 'LATE' | 'CLOSED' {
  if (!Number.isFinite(submittedAt.getTime())) throw new Error('Submission time must be valid.');
  if (policy.openDate && submittedAt < policy.openDate) return 'NOT_OPEN';
  if (!policy.dueDate || submittedAt <= policy.dueDate) return 'ON_TIME';
  if (policy.hideAfterDue || !policy.lateDeadline || submittedAt > policy.lateDeadline) return 'CLOSED';
  return 'LATE';
}

/** Linear percentage of the earned score; partial hours/days are prorated, never compounded. */
export function calculateLatePenalty(earnedScore: number, policy: LessonPolicy, submittedAt: Date) {
  if (!Number.isFinite(earnedScore) || earnedScore < 0) throw new Error('Earned score must be nonnegative.');
  const status = submissionStatus(policy, submittedAt);
  if (status === 'NOT_OPEN' || status === 'CLOSED') throw new Error('Submissions are not accepted at this time.');
  let penaltyPercent = 0;
  if (status === 'LATE' && policy.dueDate && policy.latePenaltyType !== 'NONE') {
    const hoursLate = (submittedAt.getTime() - policy.dueDate.getTime()) / 3_600_000;
    const periods =
      policy.latePenaltyType === 'FIXED' ? 1 : policy.latePenaltyType === 'DAILY' ? hoursLate / 24 : hoursLate;
    penaltyPercent = Math.min(100, policy.latePenaltyPercent * periods);
  }
  return { earnedScore, penaltyPercent, finalScore: earnedScore * (1 - penaltyPercent / 100) };
}

export function describeLatePenalty(policy: Pick<LessonPolicy, 'latePenaltyType' | 'latePenaltyPercent'>): string {
  if (policy.latePenaltyType === 'NONE') return 'No late penalty.';
  const unit =
    policy.latePenaltyType === 'HOURLY'
      ? 'per hour'
      : policy.latePenaltyType === 'DAILY'
        ? 'per day (24 hours)'
        : 'once';
  return `${policy.latePenaltyPercent}% of the earned score deducted ${unit}.${policy.latePenaltyType === 'FIXED' ? '' : ' Partial periods are prorated.'} Maximum deduction: 100%.`;
}

export interface LessonScheduleValue {
  openDate: string;
  dueDate: string;
  lateDeadline: string;
  hideAfterDue: boolean;
  latePenaltyType: LatePenaltyType;
  latePenaltyPercent: string;
}

export const emptyLessonSchedule: LessonScheduleValue = {
  openDate: '',
  dueDate: '',
  lateDeadline: '',
  hideAfterDue: false,
  latePenaltyType: 'NONE',
  latePenaltyPercent: '0',
};

export function toDateTimeInput(value: Date | string | null): string {
  return value ? new Date(value).toISOString().slice(0, 23) : '';
}

export function schedulePayload(value: LessonScheduleValue): LessonPolicyInput {
  return {
    openDate: value.openDate ? `${value.openDate}Z` : null,
    dueDate: value.dueDate ? `${value.dueDate}Z` : null,
    lateDeadline: value.lateDeadline ? `${value.lateDeadline}Z` : null,
    hideAfterDue: value.hideAfterDue,
    latePenaltyType: value.latePenaltyType,
    latePenaltyPercent: value.latePenaltyPercent === '' ? NaN : Number(value.latePenaltyPercent),
  };
}
