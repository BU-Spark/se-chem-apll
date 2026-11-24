'use client';
import styles from '@/app/components/InstructorForm/form.module.css';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className={styles.actions}>
        <button
          className={styles.submitBtn}
          disabled={!token || busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const res = await fetch('/api/workspaces/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);
              router.replace(`/workspaces/${data.workspaceId}`);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Unable to accept invitation.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Joining…' : 'Accept invitation'}
        </button>
      </div>
      {(!token || error) && (
        <p className={styles.error} role="alert">
          {error || 'This invitation link is incomplete.'}
        </p>
      )}
    </>
  );
}
