'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

type Role = 'STUDENT' | 'INSTRUCTOR' | null;
export default function RoleSelector({
  currentRole,
  clerkUserId,
  admin,
  debug = false,
}: {
  currentRole: Role;
  clerkUserId?: string;
  admin: boolean;
  debug?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function select(appRole: Role) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/me/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appRole }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? 'Unable to change role.');
      }
      router.push(appRole === 'INSTRUCTOR' ? '/instructor' : appRole === 'STUDENT' ? '/student' : '/select-role');
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to change role.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{debug ? 'Switch role' : 'Welcome to Spark 26'}</h1>
        <p className={styles.subtitle}>Choose the student or instructor experience.</p>
        {debug && clerkUserId && (
          <p>
            Clerk user ID: <code>{clerkUserId}</code>
          </p>
        )}
        {currentRole && <p>Current role: {currentRole === 'STUDENT' ? 'Student' : 'Instructor'}</p>}
        {admin && <p>Your administrator access remains available in either role.</p>}
        <div className={styles.roleButtons}>
          <button disabled={saving} className={styles.roleButton} onClick={() => select('STUDENT')}>
            <span className={styles.roleTitle}>Student</span>
            <span className={styles.roleDescription}>Work through your enrolled courses</span>
          </button>
          <button disabled={saving} className={styles.roleButton} onClick={() => select('INSTRUCTOR')}>
            <span className={styles.roleTitle}>Instructor</span>
            <span className={styles.roleDescription}>Manage courses, lessons, and nodes</span>
          </button>
        </div>
        {debug && (
          <p>
            <button disabled={saving || currentRole === null} onClick={() => select(null)}>
              Clear role &amp; go to selection
            </button>
          </p>
        )}
        {saving && <p role="status">Saving role…</p>}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {admin && (
          <p>
            <Link href="/admin">Administration</Link>
          </p>
        )}
      </div>
    </div>
  );
}
