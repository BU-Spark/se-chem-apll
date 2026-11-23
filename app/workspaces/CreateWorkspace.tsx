'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '@/app/components/InstructorForm/form.module.css';
export default function CreateWorkspace() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={styles.form}
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const res = await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          router.push(`/workspaces/${data.id}`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to create workspace.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Workspace details</h2>
        <label className={styles.field}>
          Workspace name
          <input
            placeholder="e.g. Chemistry teaching team"
            autoComplete="off"
            disabled={busy}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
        </label>
      </section>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Link className={styles.cancelLink} href="/workspaces">
          Cancel
        </Link>
        <button type="submit" className={styles.submitBtn} disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create workspace'}
        </button>
      </div>
    </form>
  );
}
