'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './grid.module.css';
export default function DeleteContentButton({
  kind,
  id,
  title,
  onError,
}: {
  kind: 'nodes' | 'lessons';
  id: string;
  title: string;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={styles.rowDeleteButton}
      aria-label={`Delete ${title}`}
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Delete “${title}”? This cannot be undone.`)) return;
        setBusy(true);
        onError('');
        try {
          const res = await fetch(`/api/instructor/${kind}/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error((await res.json()).error || 'Unable to delete content.');
          router.refresh();
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Unable to delete content.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
