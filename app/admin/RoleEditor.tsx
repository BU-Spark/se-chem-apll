'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
export default function RoleEditor({
  user,
}: {
  user: {
    id: string;
    email: string;
    appRole: 'STUDENT' | 'INSTRUCTOR' | null;
    platformRole: 'MEMBER' | 'ADMIN';
    clerkUserId: string | null;
  };
}) {
  const router = useRouter();
  const [appRole, setAppRole] = useState(user.appRole ?? '');
  const [platformRole, setPlatformRole] = useState(user.platformRole);
  const [saved, setSaved] = useState({ appRole: user.appRole ?? '', platformRole: user.platformRole });
  const dirty = appRole !== saved.appRole || platformRole !== saved.platformRole;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <form
      className={styles.roles}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!dirty || busy) return;
        setBusy(true);
        setMessage('');
        try {
          const response = await fetch(`/api/admin/users/${user.id}/roles`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appRole: appRole || null, platformRole }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? 'Unable to update roles.');
          setSaved({ appRole, platformRole });
          setMessage('Saved');
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Unable to update roles.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        <span className={styles.srOnly}>Application role</span>
        <select
          aria-label={`Application role for ${user.email}`}
          value={appRole}
          disabled={busy}
          onChange={(event) => {
            setAppRole(event.target.value as typeof appRole);
            setMessage('');
          }}
        >
          <option value="">Not selected</option>
          <option value="STUDENT">Student</option>
          <option value="INSTRUCTOR">Instructor</option>
        </select>
      </label>
      <label>
        <span className={styles.srOnly}>Platform access</span>
        <select
          aria-label={`Platform access for ${user.email}`}
          value={platformRole}
          disabled={busy}
          onChange={(event) => {
            setPlatformRole(event.target.value as typeof platformRole);
            setMessage('');
          }}
        >
          <option value="MEMBER">Member</option>
          <option value="ADMIN" disabled={!user.clerkUserId}>
            Admin
          </option>
        </select>
      </label>
      <button className={dirty ? styles.saveActive : undefined} disabled={busy || !dirty}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      {message && <span role="status">{message}</span>}
    </form>
  );
}
