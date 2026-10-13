'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';
import { isNumberAnswer } from '@/app/utils/quizGrading';
import type { StudentQuizQuestion } from '@/app/utils/studentQuizQuestion';
import styles from '../../quiz.module.css';

type QuizAnswer = { selectedIndices: number[] } | { rawAnswer: string };

const LETTERS = 'ABCDEFGH';

function isAnswered(answer: QuizAnswer | undefined): boolean {
  if (answer === undefined) return false;
  if ('selectedIndices' in answer) return answer.selectedIndices.length > 0;
  return isNumberAnswer(answer.rawAnswer);
}

export default function QuizPlayer({
  attemptId,
  title,
  questions,
}: {
  attemptId: string;
  title: string;
  questions: StudentQuizQuestion[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = questions[index];
  const answer = answers[question.id];
  const isLast = index === questions.length - 1;
  const selected = answer && 'selectedIndices' in answer ? answer.selectedIndices : [];
  const rawAnswer = answer && 'rawAnswer' in answer ? answer.rawAnswer : '';
  const showNumberError = rawAnswer.trim() !== '' && !isNumberAnswer(rawAnswer);

  function setAnswer(value: QuizAnswer) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  }

  function toggleChoice(choiceIndex: number) {
    if (question.type !== 'multipleChoice') return;
    if (!question.allowsMultiple) {
      setAnswer({ selectedIndices: [choiceIndex] });
    } else if (selected.includes(choiceIndex)) {
      setAnswer({ selectedIndices: selected.filter((i) => i !== choiceIndex) });
    } else {
      setAnswer({ selectedIndices: [...selected, choiceIndex].sort((a, b) => a - b) });
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/student/quiz/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: questions.map((q) => ({ questionId: q.id, ...answers[q.id] })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not submit the quiz');
      // The page re-renders on the server and shows the saved result.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the quiz');
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.quizScreen}>
      <header className={styles.quizHeader}>
        <Link href="/student" className={styles.quizClose} aria-label="Exit quiz">
          ✕
        </Link>
        <div>
          <p className={styles.quizTitle}>{title}</p>
          <div className={styles.progress} aria-hidden="true">
            {questions.map((q, i) => (
              <span key={q.id} className={i <= index ? styles.progressDone : styles.progressTodo} />
            ))}
          </div>
          <p className={styles.progressLabel}>
            {index + 1}/{questions.length} Questions
          </p>
        </div>
      </header>

      <section className={styles.question} aria-label={`Question ${index + 1}`}>
        <MarkdownPreview content={question.prompt} />

        {question.type === 'multipleChoice' ? (
          <>
            {question.allowsMultiple && <p className={styles.hint}>Select all that apply.</p>}
            <div className={styles.choices} role={question.allowsMultiple ? 'group' : 'radiogroup'}>
              {question.choices.map((choice, choiceIndex) => (
                <button
                  key={choiceIndex}
                  type="button"
                  role={question.allowsMultiple ? 'checkbox' : 'radio'}
                  aria-checked={selected.includes(choiceIndex)}
                  className={selected.includes(choiceIndex) ? styles.choiceSelected : styles.choice}
                  onClick={() => toggleChoice(choiceIndex)}
                >
                  <span className={styles.choiceLetter}>{LETTERS[choiceIndex]}</span>
                  <MarkdownPreview content={choice} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <label className={styles.shortAnswer}>
            <span className={styles.hint}>Your answer (number)</span>
            <input
              type="text"
              inputMode="decimal"
              className={styles.numberInput}
              value={rawAnswer}
              onChange={(e) => setAnswer({ rawAnswer: e.target.value })}
              aria-invalid={showNumberError}
            />
            {showNumberError && (
              <span role="alert" className={styles.error}>
                Please enter a number, e.g. 7 or 0.5.
              </span>
            )}
          </label>
        )}

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </section>

      <footer className={styles.quizFooter}>
        {index > 0 && (
          <button type="button" className={styles.secondaryButton} onClick={() => setIndex(index - 1)}>
            Back
          </button>
        )}
        {isLast ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSubmit}
            disabled={!questions.every((q) => isAnswered(answers[q.id])) || submitting}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        ) : (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setIndex(index + 1)}
            disabled={!isAnswered(answer)}
          >
            Next
          </button>
        )}
      </footer>
    </div>
  );
}
