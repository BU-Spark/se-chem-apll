'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../quiz.module.css';

export default function StartQuizButton({ lessonNodeId }: { lessonNodeId: string }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/student/quiz/${lessonNodeId}/start`, { method: 'POST' });
      // A server crash returns an empty body, so don't assume JSON.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not start the quiz');
      router.push(`/student/quiz/attempt/${data.attemptId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the quiz');
      setStarting(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.primaryButton} onClick={handleStart} disabled={starting}>
        {starting ? 'Starting…' : 'Continue'}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </>
  );
}
