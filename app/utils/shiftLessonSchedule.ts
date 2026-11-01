import type { LessonScheduleValue } from './lessonSubmissionPolicy';

export type ScheduledLesson = LessonScheduleValue & { lessonId: string; title: string };
export function openDateDelta(before: string, after: string): number | null {
  if (!before || !after) return null;
  const delta = Date.parse(`${after}Z`) - Date.parse(`${before}Z`);
  return Number.isFinite(delta) && delta !== 0 ? delta : null;
}

/** The anchor still has its original date here, so every timestamp shifts exactly once. */
export function shiftLessonSchedule<T extends ScheduledLesson>(rows: T[], delta: number): T[] {
  if (!Number.isFinite(delta)) throw new Error('Invalid schedule shift.');
  return rows.map((row) => {
    const shifted = { ...row };
    for (const key of ['openDate', 'dueDate', 'lateDeadline'] as const) {
      if (row[key]) shifted[key] = new Date(Date.parse(`${row[key]}Z`) + delta).toISOString().slice(0, 23);
    }
    return shifted;
  });
}
