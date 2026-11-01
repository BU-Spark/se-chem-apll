'use client';
import { useEffect, useState } from 'react';
import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';
import { describeLatePenalty } from '@/app/utils/lessonSubmissionPolicy';
import type { Details, ResponseItem, Submission } from './types';
import styles from './page.module.css';
function useJson<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError(false);
    fetch(url, { signal: c.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const value = await r.json();
        if (!c.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!c.signal.aborted) setError(true);
      });
    return () => c.abort();
  }, [url, retry]);
  return { data, error, retry: () => setRetry((n) => n + 1) };
}
const date = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
    : 'Not recorded';
const pct = (n: number | null) => (n === null ? 'Completion only' : `${Number(n.toFixed(2))}%`);
function ErrorMessage({ retry }: { retry: () => void }) {
  return (
    <p role="alert">
      Could not load results.{' '}
      <button type="button" onClick={retry}>
        Retry
      </button>
    </p>
  );
}
function Answers({ url }: { url: string }) {
  const { data, error, retry } = useJson<{ responses: ResponseItem[] }>(url);
  if (error) return <ErrorMessage retry={retry} />;
  if (!data) return <p role="status">Loading answers…</p>;
  return (
    <div>
      {!data.responses.length && <p>No recorded answers.</p>}
      {data.responses.map((r) => {
        const options = r.snapshot.options;
        const choices = Array.isArray(options)
          ? options
          : options && typeof options === 'object' && 'choices' in options && Array.isArray(options.choices)
            ? options.choices
            : [];
        return (
          <article key={r.id} className={styles.answer}>
            <p>{r.isCorrect == null ? 'Ungraded' : r.isCorrect ? 'Correct' : 'Incorrect'}</p>
            <MarkdownPreview content={r.snapshot.prompt} />
            <strong>Recorded answer</strong>
            {r.rawAnswer != null ? (
              <pre className={styles.rawAnswer}>{r.rawAnswer}</pre>
            ) : (
              <ul>
                {r.selectedIndices.map((i) => (
                  <li key={i}>
                    Choice {i + 1}
                    {typeof choices[i] === 'string' && <MarkdownPreview content={choices[i]} />}
                  </li>
                ))}
              </ul>
            )}
            <p>{date(r.createdAt)}</p>
          </article>
        );
      })}
    </div>
  );
}
function AttemptAnswers({ id, url, label }: { id: string; url: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className={styles.attempt} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{label}</summary>
      {open && <Answers url={`${url}&attemptId=${encodeURIComponent(id)}`} />}
    </details>
  );
}
function SubmissionView({ submission: s, best, url }: { submission: Submission; best: boolean; url: string }) {
  return (
    <section className={styles.answer}>
      {s.snapshot.fictional && <p className={styles.note}>Fictional demo result</p>}
      <h3>
        Submission #{s.number}
        {best ? ' · Best result' : ''}
      </h3>
      <p>
        {date(s.submittedAt)} · {s.passed ? 'Passed' : 'Not passed'}
      </p>
      <p>
        Raw: {pct(s.rawPercent)} · Penalty: {Number(s.penaltyPercent.toFixed(2))}% of earned score · Final:{' '}
        <strong>{pct(s.finalPercent)}</strong>
      </p>
      <p>
        Due: {date(s.snapshot.policy.dueDate)} · Late deadline: {date(s.snapshot.policy.lateDeadline)}
      </p>
      <p>
        {Number(s.snapshot.hoursLate.toFixed(3))} hours late · {describeLatePenalty(s.snapshot.policy)}
      </p>
      <p className={styles.note}>Policy and work captured when submitted. Quiz percentages are averaged equally.</p>
      <ul>
        {s.snapshot.nodes.map((n) => (
          <li key={n.attemptId}>
            {n.title}: {pct(n.score)} · Passing threshold {n.passingPercent}%
          </li>
        ))}
      </ul>
      {s.snapshot.attemptIds.map((id, index) => (
        <AttemptAnswers key={id} id={id} url={url} label={`Submitted attempt ${index + 1} — view recorded answers`} />
      ))}
    </section>
  );
}
export default function ResultDetails({
  courseId,
  studentId,
  lessonId,
}: {
  courseId: string;
  studentId: string;
  lessonId: string;
}) {
  const base = `/api/instructor/courses/${encodeURIComponent(courseId)}/gradebook?${new URLSearchParams({ studentId, assignmentId: lessonId })}`;
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, error, retry } = useJson<Details>(base + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
  if (error) return <ErrorMessage retry={retry} />;
  if (!data) return <p role="status">Loading results…</p>;
  return (
    <>
      <h3>Assignment progress</h3>
      <p>
        {data.progress?.percentComplete ?? 0}% complete · Started {date(data.progress?.startedAt)}
      </p>
      <h3>Submission history</h3>
      {!data.submissions.length && <p>No submissions yet.</p>}
      {data.submissions.map((s) => (
        <SubmissionView key={s.id} submission={s} best={s.id === data.bestId} url={base} />
      ))}
      <div className={styles.paging}>
        {cursor && <button onClick={() => setCursor(null)}>Newest submissions</button>}
        {data.nextCursor && <button onClick={() => setCursor(data.nextCursor)}>Older submissions</button>}
      </div>
      <h3>Recent attempts</h3>
      <p className={styles.note}>
        Up to 25 recent attempts. Submitted attempts are always accessible from submission history above.
      </p>
      {data.attempts.map((a) => (
        <AttemptAnswers
          key={a.id}
          id={a.id}
          url={base}
          label={`${a.snapshot.nodeTitle} · ${a.kind} · ${a.score === null ? (a.completedAt ? 'Completed' : 'In progress') : pct(a.score)} · ${date(a.startedAt)}`}
        />
      ))}
      {!data.attempts.length && <p>No recorded attempts.</p>}
    </>
  );
}
