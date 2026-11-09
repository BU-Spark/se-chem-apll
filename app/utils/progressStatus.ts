import type { LessonStatus } from '@prisma/client';

// How each progress status is written for students, shared by course and lesson cards.
export const PROGRESS_LABELS: Record<LessonStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

// A node on a lesson roadmap: locked until every node pointing to it is complete or incomplete.
// In progress: the student started a quiz or video questions. Incomplete: the student used up
// their quiz attempts without passing; they can still move on.
export type NodeStatus = 'LOCKED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE';

export const NODE_STATUS_LABELS: Record<NodeStatus, string> = {
  LOCKED: 'Locked',
  NOT_STARTED: PROGRESS_LABELS.NOT_STARTED,
  IN_PROGRESS: PROGRESS_LABELS.IN_PROGRESS,
  COMPLETED: PROGRESS_LABELS.COMPLETED,
  INCOMPLETE: 'Incomplete',
};

// Whether a lesson accepts work right now, from its open date, due date and late deadline.
export type LessonAvailability = 'OPEN' | 'NOT_OPEN' | 'CLOSED';

export const AVAILABILITY_LABELS: Record<Exclude<LessonAvailability, 'OPEN'>, string> = {
  NOT_OPEN: 'Not open yet',
  CLOSED: 'Closed',
};

export function statusFromPercent(percent: number): LessonStatus {
  if (percent === 0) return 'NOT_STARTED';
  if (percent === 100) return 'COMPLETED';
  return 'IN_PROGRESS';
}
