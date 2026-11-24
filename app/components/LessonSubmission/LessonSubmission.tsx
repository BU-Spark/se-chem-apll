'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LessonSubmissionView } from '@/lib/submissions/service';
import { describeLatePenalty } from '@/app/utils/lessonSubmissionPolicy';
import buttons from '@/app/styles/buttons.module.css';
import styles from './LessonSubmission.module.css';

const percent = (n: number | null) => (n === null ? 'Completion only' : `${Number(n.toFixed(2))}%`);
// Explicit timezone keeps server rendering and browser hydration consistent.
const formatTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value)) + ' UTC';
type Receipt = NonNullable<LessonSubmissionView['best']>;

function ReceiptView({ receipt }: { receipt: Receipt }) {
  return (
    <div>
      <p>
        Submission #{receipt.number} · <time dateTime={receipt.submittedAt}>{formatTime(receipt.submittedAt)}</time>
      </p>
      <dl className={styles.grades}>
        <div>
          <dt>Raw grade</dt>
          <dd>{percent(receipt.rawPercent)}</dd>
        </div>
        <div>
          <dt>Late penalty</dt>
          <dd>{percent(receipt.penaltyPercent)} of earned score</dd>
        </div>
        <div>
          <dt>Final grade</dt>
          <dd>{percent(receipt.finalPercent)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function LessonSubmission({ assignmentId, view }: { assignmentId: string; view: LessonSubmissionView }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<(Receipt & { idempotencyKey: string }) | null>(null);
  const open = view.window === 'ON_TIME' || view.window === 'LATE';
  const latest = saved && (!view.latest || saved.number > view.latest.number) ? saved : view.latest;
  const best = saved && (!view.best || (saved.finalPercent ?? -1) > (view.best.finalPercent ?? -1)) ? saved : view.best;

  async function retry() {
    if (inFlight.current || !view.pendingKey) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/student/assignments/${assignmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submitRoadmap', key: view.pendingKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to submit. Please retry.');
      setSaved(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit. Please retry.');
    } finally {
      inFlight.current = false;
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <section className={styles.panel} aria-label="Lesson submission">
      <h2>Lesson submission</h2>
      <p>Your lesson is submitted automatically when every node is finished. Your highest final grade is retained.</p>
      {view.dueDate && <p>Due: {formatTime(view.dueDate)}</p>}
      {view.lateDeadline && <p>Late deadline: {formatTime(view.lateDeadline)}</p>}
      <p>{describeLatePenalty(view)}</p>
      {!open && (
        <p role="status">
          {view.window === 'CLOSED'
            ? 'Submissions are closed. Your saved work and previous submissions are retained.'
            : 'Submissions are not yet open.'}
        </p>
      )}
      {open && view.blockedReason && <p>{view.blockedReason}</p>}
      {open && view.pendingKey && saved?.idempotencyKey !== view.pendingKey && (
        <div>
          <p role="status">
            {view.latest
              ? 'New work is ready to submit.'
              : 'Your work is finished, but this lesson has not been submitted.'}
          </p>
          <button type="button" className={buttons.primary} disabled={busy} onClick={retry}>
            {busy ? 'Submitting…' : 'Retry submission'}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {latest && (
        <div role="status">
          <h3>Submission receipt</h3>
          <ReceiptView receipt={latest} />
        </div>
      )}
      {best && best.id !== latest?.id && (
        <div>
          <h3>Best result retained</h3>
          <ReceiptView receipt={best} />
        </div>
      )}
    </section>
  );
}
