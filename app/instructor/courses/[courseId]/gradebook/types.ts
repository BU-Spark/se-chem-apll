export type Submission = {
  id: string;
  number: number;
  submittedAt: string;
  rawPercent: number | null;
  penaltyPercent: number;
  finalPercent: number | null;
  passed: boolean;
  gradingStatus: 'GRADED' | 'COMPLETION_ONLY';
  snapshot: {
    fictional?: boolean;
    lessonTitle: string;
    hoursLate: number;
    policy: {
      dueDate: string | null;
      lateDeadline: string | null;
      latePenaltyType: 'NONE' | 'FIXED' | 'HOURLY' | 'DAILY';
      latePenaltyPercent: number;
    };
    nodes: { title: string; attemptId: string; score: number; passingPercent: number }[];
    attemptIds: string[];
  };
};
export type Progress = {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  best: Submission | null;
  startedAt?: string | null;
  completedAt?: string | null;
};
export type GradeRow = { id: string; name: string; email: string; grades: Record<string, Progress> };
export type GradeLesson = { id: string; title: string };
export function gradeLabel(progress?: Progress) {
  if (progress?.best?.finalPercent != null) return `${Number(progress.best.finalPercent.toFixed(2))}%`;
  if (progress?.best?.gradingStatus === 'COMPLETION_ONLY') return 'Completed · no quizzes';
  if (progress?.status === 'COMPLETED') return 'Completed · ungraded';
  if (progress?.status === 'IN_PROGRESS') return 'In progress';
  return 'Not started';
}
export type Attempt = {
  id: string;
  score: number | null;
  isPassing: boolean | null;
  kind: string;
  startedAt: string;
  completedAt: string | null;
  snapshot: { nodeTitle: string };
};
export type Details = {
  progress: Omit<Progress, 'best'> | null;
  bestId: string | null;
  submissions: Submission[];
  nextCursor: string | null;
  attempts: Attempt[];
};
export type ResponseItem = {
  id: string;
  selectedIndices: number[];
  rawAnswer: string | null;
  isCorrect: boolean | null;
  createdAt: string;
  snapshot: { prompt: string; options: unknown };
};
