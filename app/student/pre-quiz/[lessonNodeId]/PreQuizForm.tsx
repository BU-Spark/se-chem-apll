'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

type Question = {
  id: string;
  prompt: string;
  options: unknown;
};

type Props = {
  lessonNodeId: string;
  lessonTitle: string;
  nodeTitle: string;
  questions: Question[];
};

type SubmitResponse = {
  score: number;
  passed: boolean;
  totalQuestions: number;
  correctAnswers: number;
};

export default function PreQuizForm({ lessonNodeId, lessonTitle, nodeTitle, questions }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const isComplete = useMemo(() => {
    return questions.every((q) => {
      if (!Array.isArray(q.options)) return true;
      return selected[q.id] !== undefined;
    });
  }, [questions, selected]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const answers = questions
        .filter((q) => Array.isArray(q.options))
        .map((q) => ({
          questionId: q.id,
          selectedIndex: selected[q.id],
        }));

      const res = await fetch(`/api/student/pre-quiz/${lessonNodeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const payload = (await res.json()) as SubmitResponse | { error?: string };
      if (!res.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Failed to submit pre-quiz');
      }

      setResult(payload as SubmitResponse);
      setTimeout(() => {
        router.push('/student');
        router.refresh();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit pre-quiz');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card}>
      <h1 className={styles.title}>Pre-quiz</h1>
      <p className={styles.subtitle}>
        {lessonTitle} · {nodeTitle}
      </p>

      {questions.length === 0 ? (
        <p className={styles.info}>No pre-quiz questions are configured for this node.</p>
      ) : (
        <form onSubmit={handleSubmit} className={styles.form}>
          {questions.map((q, idx) => {
            const options = Array.isArray(q.options) ? (q.options as string[]) : [];
            return (
              <fieldset key={q.id} className={styles.question}>
                <legend className={styles.prompt}>
                  {idx + 1}. {q.prompt}
                </legend>
                {options.length === 0 ? (
                  <p className={styles.info}>Unsupported question format for this MVP.</p>
                ) : (
                  <div className={styles.options}>
                    {options.map((option, optionIdx) => (
                      <label key={`${q.id}-${optionIdx}`} className={styles.optionLabel}>
                        <input
                          type="radio"
                          name={q.id}
                          value={optionIdx}
                          checked={selected[q.id] === optionIdx}
                          onChange={() =>
                            setSelected((prev) => ({
                              ...prev,
                              [q.id]: optionIdx,
                            }))
                          }
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            );
          })}

          {error && <p className={styles.error}>{error}</p>}
          {result && (
            <p className={styles.success}>
              Submitted! Score: {result.score}% ({result.correctAnswers}/{result.totalQuestions}) ·{' '}
              {result.passed ? 'Passed' : 'Not passed'}
            </p>
          )}

          <button type="submit" className={styles.submitBtn} disabled={!isComplete || submitting || !!result}>
            {submitting ? 'Submitting...' : 'Submit pre-quiz'}
          </button>
        </form>
      )}
    </section>
  );
}
