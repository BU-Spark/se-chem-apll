'use client';

import { useEffect, useState } from 'react';
import { openDateDelta, shiftLessonSchedule, type ScheduledLesson } from '@/app/utils/shiftLessonSchedule';
import { schedulePayload, validateLessonPolicy, type LessonScheduleValue } from '@/app/utils/lessonSubmissionPolicy';
import styles from './ScheduleShiftPrompt.module.css';

const previewDateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

function formatPreviewDate(value: string) {
  const date = new Date(`${value}Z`);
  return Number.isFinite(date.getTime()) ? previewDateFormat.format(date) : 'Invalid date';
}

export function useScheduleShift<T extends ScheduledLesson>(
  rows: T[],
  setRows: React.Dispatch<React.SetStateAction<T[]>>
) {
  const [editing, setEditing] = useState<{ lessonId: string; originalDate: string } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [undo, setUndo] = useState<T[] | null>(null);
  const anchor = rows.find((row) => row.lessonId === editing?.lessonId);
  const delta = editing && anchor ? openDateDelta(editing.originalDate, anchor.openDate) : null;
  const hasShift = delta !== null;

  // Wait for a typing pause before first showing the prompt. Once visible,
  // derive its contents directly from the draft so continued edits stay reactive.
  const draftOpenDate = anchor?.openDate;
  useEffect(() => {
    if (!hasShift) {
      setShowPrompt(false);
      return;
    }
    if (showPrompt) return;
    const timer = window.setTimeout(() => setShowPrompt(true), 400);
    return () => window.clearTimeout(timer);
  }, [hasShift, draftOpenDate, editing?.lessonId, showPrompt]);

  function startEditing(lessonId: string) {
    if (editing?.lessonId === lessonId) return;
    const row = rows.find((row) => row.lessonId === lessonId);
    if (row) {
      setEditing({ lessonId, originalDate: row.openDate });
      setShowPrompt(false);
    }
  }
  function finishEditing(lessonId: string) {
    if (editing?.lessonId === lessonId && delta === null) setEditing(null);
  }
  function update(lessonId: string, patch: Partial<LessonScheduleValue>) {
    if (patch.openDate !== undefined) startEditing(lessonId);
    setUndo(null);
    setRows((current) => current.map((row) => (row.lessonId === lessonId ? { ...row, ...patch } : row)));
  }
  // Other edits made while the prompt is open remain part of the current draft.
  // Only the anchor's open date is restored for calculating the proposed shift.
  const before = rows.map((row) =>
    row.lessonId === editing?.lessonId ? { ...row, openDate: editing.originalDate } : row
  );
  const shifted = delta !== null ? shiftLessonSchedule(before, delta) : null;
  function choose(all: boolean) {
    if (!shifted) return;
    setUndo(before);
    if (all) setRows(shifted);
    setEditing(null);
    setShowPrompt(false);
  }
  const prompt =
    showPrompt && shifted && delta !== null ? (
      <ScheduleShiftPrompt before={before} shifted={shifted} delta={delta} onChoose={choose} />
    ) : undo ? (
      <p role="status">
        Schedule updated.{' '}
        <button
          type="button"
          onClick={() => {
            setRows(undo);
            setUndo(null);
            setEditing(null);
            setShowPrompt(false);
          }}
        >
          Undo date change
        </button>
      </p>
    ) : null;
  return {
    update,
    startEditing,
    finishEditing,
    prompt,
    pending: hasShift,
    clearUndo: () => {
      setUndo(null);
      setEditing(null);
      setShowPrompt(false);
    },
  };
}

function ScheduleShiftPrompt({
  before,
  shifted,
  delta,
  onChoose,
}: {
  before: ScheduledLesson[];
  shifted: ScheduledLesson[];
  delta: number;
  onChoose: (all: boolean) => void;
}) {
  const errors = shifted
    .map((row) => {
      const error = validateLessonPolicy(schedulePayload(row));
      return error ? `${row.title}: ${error}` : '';
    })
    .filter(Boolean);
  const minutes = Math.abs(delta) / 60_000;
  const unit = minutes >= 1440 ? 'day' : minutes >= 60 ? 'hour' : 'minute';
  const count = minutes / (unit === 'day' ? 1440 : unit === 'hour' ? 60 : 1);
  const amount =
    count < 0.01
      ? 'less than a minute'
      : new Intl.NumberFormat('en-US', {
          style: 'unit',
          unit,
          unitDisplay: 'long',
          maximumFractionDigits: 2,
        }).format(count);
  return (
    <section role="dialog" aria-labelledby="shift-title" className={styles.prompt}>
      <h3 id="shift-title">Shift the other dates?</h3>
      <p>
        You moved this open date {delta > 0 ? 'forward' : 'backward'} by {amount}. Shift all other dates in this course
        by the same amount?
      </p>
      <div className={styles.preview}>
        <table>
          <caption>Preview of all dates after shifting (UTC)</caption>
          <thead>
            <tr>
              <th>Lesson</th>
              <th>Date</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {shifted.flatMap((row, index) =>
              (['openDate', 'dueDate', 'lateDeadline'] as const)
                .filter((key) => !!row[key])
                .map((key) => (
                  <tr key={`${row.lessonId}-${key}`}>
                    <td>{row.title}</td>
                    <td>{key === 'openDate' ? 'Open' : key === 'dueDate' ? 'Due' : 'Late deadline'}</td>
                    <td>{formatPreviewDate(before[index][key])}</td>
                    <td>{formatPreviewDate(row[key])}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
      {errors.map((error) => (
        <p role="alert" key={error}>
          {error}
        </p>
      ))}
      <div className={styles.actions}>
        <button type="button" onClick={() => onChoose(false)}>
          Only change this date
        </button>
        <button type="button" disabled={errors.length > 0} onClick={() => onChoose(true)}>
          Shift all dates
        </button>
      </div>
    </section>
  );
}
