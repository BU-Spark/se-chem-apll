'use client';

import { useState } from 'react';
import styles from './page.module.css';

export default function CourseJoinCodeControls({
  courseId,
  initialCode,
}: {
  courseId: string;
  initialCode: string | null;
}) {
  const [code, setCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function updateCode(method: 'POST' | 'DELETE') {
    setPending(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(`/api/instructor/courses/${courseId}/join-code`, { method });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCode(data.code);
      setStatus(data.code ? 'New code ready to share.' : 'Course code disabled.');
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : 'Unable to update the course code.');
    } finally {
      setPending(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    setError('');
    setStatus('');
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Course code copied.');
    } catch {
      setError('Could not copy the code. Select and copy it manually.');
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Course join code</h2>
      <p className={styles.sectionDesc}>
        Share this code with students so they can enroll from My courses. Rotating or disabling it closes access through
        the current code. Enrolled students keep their access.
      </p>
      {code && (
        <p>
          <code className={styles.joinCode}>{code}</code>
        </p>
      )}
      <div className={styles.joinActions}>
        <button type="button" className={styles.enrollBtn} disabled={pending} onClick={() => updateCode('POST')}>
          {code ? 'Rotate code' : 'Generate code'}
        </button>
        {code && (
          <>
            <button type="button" className={styles.enrollBtn} disabled={pending} onClick={copyCode}>
              Copy code
            </button>
            <button type="button" className={styles.enrollBtn} disabled={pending} onClick={() => updateCode('DELETE')}>
              Disable code
            </button>
          </>
        )}
      </div>
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
