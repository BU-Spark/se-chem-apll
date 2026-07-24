'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMultipleChoiceChoices } from '@/app/utils/multipleChoice';
import { parseShortAnswerOptions, ParsedShortAnswer } from '@/app/utils/shortAnswer';
import styles from './page.module.css';

type Question = {
  id: string;
  prompt: string;
  options: unknown;
};

type ParsedQuestionFormat = { type: 'multipleChoice'; choices: string[] } | ParsedShortAnswer;

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
  const [selected, setSelected] = useState<Record<string, number[]>>({});
  const [shortAnswers, setShortAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  function parseQuestionFormat(options: unknown): ParsedQuestionFormat | null {
    const choices = getMultipleChoiceChoices(options);
    return choices ? { type: 'multipleChoice', choices } : parseShortAnswerOptions(options);
  }

  const isComplete = useMemo(() => {
    return questions.every((q) => {
      const format = parseQuestionFormat(q.options);
      if (!format) return false;
      if (format.type === 'multipleChoice') return (selected[q.id]?.length ?? 0) > 0;
      return shortAnswers[q.id] !== undefined && String(shortAnswers[q.id]).trim().length > 0;
    });
  }, [questions, selected, shortAnswers]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const answers = questions.map((q) => ({
        questionId: q.id,
        selectedIndices: selected[q.id],
        rawAnswer: shortAnswers[q.id],
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
            const format = parseQuestionFormat(q.options);
            return (
              <fieldset key={q.id} className={styles.question}>
                <legend className={styles.prompt}>
                  {idx + 1}. {q.prompt}
                </legend>
                {!format ? (
                  <p className={styles.info}>Unsupported question format for this MVP.</p>
                ) : format.type === 'multipleChoice' ? (
                  <div className={styles.options}>
                    {format.choices.map((option, optionIdx) => (
                      <label key={`${q.id}-${optionIdx}`} className={styles.optionLabel}>
                        <input
                          type="checkbox"
                          value={optionIdx}
                          checked={selected[q.id]?.includes(optionIdx) ?? false}
                          onChange={() =>
                            setSelected((prev) => ({
                              ...prev,
                              [q.id]: prev[q.id]?.includes(optionIdx)
                                ? prev[q.id].filter((index) => index !== optionIdx)
                                : [...(prev[q.id] ?? []), optionIdx].sort((a, b) => a - b),
                            }))
                          }
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className={styles.optionLabel}>
                    <span className={styles.shortAnswerLabel}>Numeric answer</span>
                    <input
                      type="number"
                      step="any"
                      value={shortAnswers[q.id] ?? ''}
                      onChange={(e) =>
                        setShortAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
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
