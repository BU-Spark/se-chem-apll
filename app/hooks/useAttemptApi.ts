'use client';

import { useState } from 'react';

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

/**
 * Calls the team's student attempt API for one course lesson (start, check, finish) and tracks
 * whether a request is running and the last error, so quiz screens share one way of doing it.
 */
export default function useAttemptApi(courseLessonId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // path: '' for the assignment route itself, '/check' to check one answer.
  async function post(body: object, path = '') {
    const res = await fetch(`/api/student/assignments/${courseLessonId}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? FALLBACK_ERROR);
    return data;
  }

  // Runs work while marking the screen busy; a thrown error is shown instead of crashing.
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : FALLBACK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return { post, run, busy, error };
}
