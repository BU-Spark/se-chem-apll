'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/app/routes';
import buttons from '@/app/styles/buttons.module.css';
import styles from './page.module.css';

export default function JoinCourseForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/student/courses/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.courseId !== 'string') {
        throw new Error(data?.error ?? 'Unable to join the course. Please try again.');
      }
      router.push(ROUTES.studentCourse(data.courseId));
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to join the course. Please try again.');
      setPending(false);
    }
  }

  return (
    <section className={styles.join} aria-labelledby="join-course-heading">
      <h2 id="join-course-heading">Join a course</h2>
      <form onSubmit={handleJoin}>
        <label htmlFor="course-join-code">Eight-letter code from your instructor</label>
        <div className={styles.joinFields}>
          <input
            id="course-join-code"
            name="code"
            type="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'course-join-error' : undefined}
          />
          <button type="submit" className={buttons.primary} disabled={pending}>
            {pending ? 'Joining…' : 'Join course'}
          </button>
        </div>
      </form>
      {error && (
        <p id="course-join-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
