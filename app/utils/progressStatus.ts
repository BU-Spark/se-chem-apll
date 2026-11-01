import type { LessonStatus } from '@prisma/client';

// How each progress status is written for students, shared by course and lesson cards.
export const PROGRESS_LABELS: Record<LessonStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export function statusFromPercent(percent: number): LessonStatus {
  if (percent === 0) return 'NOT_STARTED';
  if (percent === 100) return 'COMPLETED';
  return 'IN_PROGRESS';
}
