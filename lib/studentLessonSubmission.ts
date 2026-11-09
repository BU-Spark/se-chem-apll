import { describeLatePenalty, submissionStatus, type LessonPolicy } from '@/app/utils/lessonSubmissionPolicy';
import { bestSubmissionOrder } from '@/lib/submissions/bestSubmission';

export const lessonPolicySelect = {
  openDate: true,
  dueDate: true,
  lateDeadline: true,
  hideAfterDue: true,
  latePenaltyType: true,
  latePenaltyPercent: true,
} as const satisfies Record<keyof LessonPolicy, true>;

export const bestSubmissionSelect = {
  orderBy: bestSubmissionOrder,
  take: 1,
  select: { finalPercent: true },
} as const;

export interface StudentLessonSubmission {
  dueDate: Date | null;
  lateDeadline: Date | null;
  penalty: string;
  window: ReturnType<typeof submissionStatus>;
  best: { finalPercent: number | null } | null;
}

export function studentLessonSubmission(
  policy: LessonPolicy,
  best: StudentLessonSubmission['best'],
  now: Date
): StudentLessonSubmission {
  return {
    dueDate: policy.dueDate,
    lateDeadline: policy.lateDeadline,
    penalty: describeLatePenalty(policy),
    window: submissionStatus(policy, now),
    best,
  };
}
