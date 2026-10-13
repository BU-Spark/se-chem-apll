'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';
import { describeLatePenalty } from '@/app/utils/lessonSubmissionPolicy';
import styles from './page.module.css';
type Receipt = {
  number: number;
  submittedAt: string;
  rawPercent: number | null;
  penaltyPercent: number;
  finalPercent: number | null;
  passed: boolean;
};
type View = {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  window: string;
  best: Receipt | null;
  policy: {
    dueDate: string | null;
    lateDeadline: string | null;
    latePenaltyType: 'NONE' | 'FIXED' | 'HOURLY' | 'DAILY';
    latePenaltyPercent: number;
  };
  nodes: {
    id: string;
    title: string;
    videoUrl: string | null;
    tasks: { kind: string; completed: boolean; score: number | null }[];
  }[];
};
type Task = {
  id: string;
  nodeTitle: string;
  kind: string;
  questions: { id: string; prompt: string; choices: string[] | null }[];
  completedAt: string | null;
  score: number | null;
};
const percent = (n: number | null) => (n === null ? 'Completion only' : `${Number(n.toFixed(2))}%`);
function ReceiptView({ receipt }: { receipt: Receipt }) {
  return (
    <p>
      Submission #{receipt.number} · {new Date(receipt.submittedAt).toLocaleString()} · Raw:{' '}
      {percent(receipt.rawPercent)} · Penalty: {Number(receipt.penaltyPercent.toFixed(2))}% of earned score · Final:{' '}
      {percent(receipt.finalPercent)} · {receipt.passed ? 'Passed' : 'Not passed'}
    </p>
  );
}
export default function AssignmentWork({ initial }: { initial: View }) {
  const [view, setView] = useState(initial);
  const [task, setTask] = useState<Task | null>(null);
  const [answers, setAnswers] = useState<Record<string, { selectedIndices?: number[]; rawAnswer?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const url = `/api/student/assignments/${view.id}`;
  async function post(body: Record<string, unknown>) {
    const signature = JSON.stringify(body);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, key: pending.current.key }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Request failed');
    pending.current = null;
    return data;
  }
  async function refresh() {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) setView(await response.json());
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const open = ['ON_TIME', 'LATE'].includes(view.window);
  const ready = view.nodes.every((n) => n.tasks.every((t) => t.completed));
  return (
    <main className={styles.page}>
      <Link href="/student">← My courses</Link>
      <h1>{view.title}</h1>
      <p>{view.courseTitle}</p>
      <section>
        <h2>Submission policy</h2>
        <p>Due: {view.policy.dueDate ? new Date(view.policy.dueDate).toLocaleString() : 'No due date'}</p>
        <p>Late deadline: {view.policy.lateDeadline ? new Date(view.policy.lateDeadline).toLocaleString() : 'None'}</p>
        <p>{describeLatePenalty(view.policy)}</p>
        <p>
          Node quizzes contribute equally. Checkpoints count toward completion only. Your highest final grade after
          penalties is retained.
        </p>
        {!open && <p>Submissions are {view.window === 'NOT_OPEN' ? 'not yet open' : 'closed'}.</p>}
      </section>
      {error && <p role="alert">{error}</p>}
      {view.nodes.map((node) => (
        <section key={node.id}>
          <h2>{node.title}</h2>
          {node.videoUrl && (
            <a href={node.videoUrl} target="_blank" rel="noopener noreferrer">
              Watch lesson video ↗
            </a>
          )}
          <div className={styles.actions}>
            {node.tasks.map((t) => (
              <button
                key={t.kind}
                type="button"
                disabled={busy || !open}
                onClick={() =>
                  run(async () => {
                    setAnswers({});
                    setTask(await post({ action: 'start', nodeId: node.id, kind: t.kind }));
                  })
                }
              >
                {t.kind === 'QUIZ' ? 'Quiz' : t.kind === 'CHECKPOINT' ? 'Checkpoints' : 'Review'} ·{' '}
                {t.completed ? (t.score === null ? 'Completed' : percent(t.score)) : 'Not completed'}
                {t.completed ? ' · Retry' : ''}
              </button>
            ))}
          </div>
        </section>
      ))}
      {task && (
        <section aria-label="Active task">
          <h2>
            {task.nodeTitle} · {task.kind.toLowerCase()}
          </h2>
          {task.completedAt ? (
            <p>Attempt recorded: {percent(task.score)}</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const result = await post({
                    action: 'finish',
                    attemptId: task.id,
                    answers: task.questions.map((q) => ({ questionId: q.id, ...answers[q.id] })),
                  });
                  setTask(result);
                  await refresh();
                });
              }}
            >
              {task.questions.map((q) => (
                <fieldset key={q.id}>
                  <legend>
                    <MarkdownPreview content={q.prompt} />
                  </legend>
                  {q.choices ? (
                    q.choices.map((choice, index) => (
                      <label key={index}>
                        <input
                          type="checkbox"
                          checked={answers[q.id]?.selectedIndices?.includes(index) ?? false}
                          onChange={(e) => {
                            const current = answers[q.id]?.selectedIndices ?? [];
                            setAnswers({
                              ...answers,
                              [q.id]: {
                                selectedIndices: e.target.checked
                                  ? [...current, index]
                                  : current.filter((i) => i !== index),
                              },
                            });
                          }}
                        />
                        <MarkdownPreview content={choice} />
                      </label>
                    ))
                  ) : (
                    <label>
                      Numeric answer
                      <input
                        required
                        type="text"
                        inputMode="decimal"
                        value={answers[q.id]?.rawAnswer ?? ''}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: { rawAnswer: e.target.value } })}
                      />
                    </label>
                  )}
                </fieldset>
              ))}
              {!task.questions.length && <p>Confirm that you have reviewed this node’s material.</p>}
              <button disabled={busy || !open} type="submit">
                {task.kind === 'REVIEW' ? 'Mark reviewed' : 'Save answers'}
              </button>
            </form>
          )}
        </section>
      )}
      <section>
        <h2>Submit lesson</h2>
        <p>Submission uses your latest completed quiz attempt for every node. Complete all tasks before submitting.</p>
        <button
          type="button"
          disabled={busy || !open || !ready}
          onClick={() =>
            run(async () => {
              setReceipt(await post({ action: 'submit' }));
              await refresh();
            })
          }
        >
          Submit lesson
        </button>
        {receipt && (
          <div role="status">
            <h3>Submission receipt</h3>
            <ReceiptView receipt={receipt} />
          </div>
        )}
        {view.best && (
          <>
            <h3>Best result</h3>
            <ReceiptView receipt={view.best} />
          </>
        )}
      </section>
    </main>
  );
}
