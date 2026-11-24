'use client';
import styles from '../../workspaces.module.css';
import formStyles from '@/app/components/InstructorForm/form.module.css';
import gridStyles from '@/app/components/InstructorGrid/grid.module.css';
import selectStyles from '@/app/components/Select/Select.module.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { WorkspaceRole } from '@prisma/client';
import { canAssignRole } from '@/lib/workspaces/permissions';
type Props = {
  workspaceId: string;
  name: string;
  role: WorkspaceRole | null;
  platformAdmin: boolean;
  hasContent?: boolean;
  members: { userId: string; name: string | null; email: string; role: WorkspaceRole }[];
  invitations: { id: string; email: string; role: WorkspaceRole; expiresAt: string }[];
};
export default function Members({
  workspaceId,
  name,
  role,
  platformAdmin,
  members,
  invitations,
  hasContent = false,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('EDITOR');
  const [newName, setNewName] = useState(name);
  const [transferTo, setTransferTo] = useState('');
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const manage = platformAdmin || role === 'OWNER' || role === 'ADMIN';
  const owner = platformAdmin || role === 'OWNER';
  async function request(path: string, method: string, body?: unknown) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save.');
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.settingsPage}>
      <header className={formStyles.pageHeader}>
        <Link className={styles.backLink} href={`/workspaces/${workspaceId}`}>
          ← Back to library
        </Link>
        <h1 className={formStyles.pageTitle}>Members and settings</h1>
        <p className={formStyles.pageSubtitle}>{name}</p>
      </header>
      {error && (
        <p className={formStyles.error} role="alert">
          {error}
        </p>
      )}
      <section aria-label="Workspace members">
        <div className={gridStyles.tableScroll}>
          <table className={gridStyles.table}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const editable =
                  m.role !== 'OWNER' && (platformAdmin || (role && canAssignRole(role, m.role, 'VIEWER')));
                return (
                  <tr key={m.userId}>
                    <td>
                      {m.name || m.email}
                      {m.name && <div className={styles.muted}>{m.email}</div>}
                    </td>
                    <td>
                      {editable ? (
                        <select
                          className={`${selectStyles.control} ${selectStyles.compact}`}
                          aria-label={`Role for ${m.email}`}
                          disabled={busy}
                          value={m.role}
                          onChange={(e) => request(`/members/${m.userId}`, 'PATCH', { role: e.target.value })}
                        >
                          {owner && <option value="ADMIN">Admin</option>}
                          <option value="EDITOR">Editor</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                      ) : (
                        m.role.charAt(0) + m.role.slice(1).toLowerCase()
                      )}
                    </td>
                    <td>
                      {editable && (
                        <button
                          type="button"
                          className={gridStyles.rowDeleteButton}
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`Remove ${m.email}? Their workspace access will be revoked.`))
                              request(`/members/${m.userId}`, 'DELETE');
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {manage && (
        <>
          <section className={formStyles.section} aria-labelledby="invite-member-title">
            <h2 id="invite-member-title" className={formStyles.sectionTitle}>
              Invite a member
            </h2>
            <p className={formStyles.sectionNote}>
              Invitations expire after seven days. Share the generated link with the named recipient.
            </p>
            <form
              className={styles.settingsForm}
              onSubmit={async (e) => {
                e.preventDefault();
                setLink('');
                const data = await request('/invitations', 'POST', { email, role: inviteRole });
                if (data) {
                  setLink(`${window.location.origin}/workspaces/accept?token=${data.token}`);
                  setEmail('');
                }
              }}
            >
              <label className={`${formStyles.field} ${styles.growField}`}>
                Email
                <input type="email" required value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className={formStyles.field}>
                Role
                <select value={inviteRole} disabled={busy} onChange={(e) => setInviteRole(e.target.value)}>
                  {owner && <option value="ADMIN">Admin</option>}
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </label>
              <button className={formStyles.submitBtn} disabled={busy}>
                Create invitation
              </button>
            </form>
            {link && (
              <p className={styles.invitationLink} role="status">
                Invitation link:{' '}
                <a className={styles.backLink} href={link}>
                  {link}
                </a>
              </p>
            )}
            <h3 className={formStyles.sectionTitle}>Pending invitations</h3>
            {invitations.length ? (
              <div className={gridStyles.tableScroll}>
                <table className={gridStyles.table}>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Expires</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((i) => (
                      <tr key={i.id}>
                        <td>{i.email}</td>
                        <td>{i.role.charAt(0) + i.role.slice(1).toLowerCase()}</td>
                        <td>{new Date(i.expiresAt).toLocaleDateString()}</td>
                        <td>
                          {(owner || i.role !== 'ADMIN') && (
                            <button
                              type="button"
                              className={gridStyles.rowDeleteButton}
                              disabled={busy}
                              onClick={() => request(`/invitations/${i.id}`, 'DELETE')}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={formStyles.sectionNote}>No pending invitations.</p>
            )}
          </section>
          <section className={formStyles.section} aria-labelledby="workspace-settings-title">
            <h2 id="workspace-settings-title" className={formStyles.sectionTitle}>
              Workspace settings
            </h2>
            <form
              className={styles.settingsForm}
              onSubmit={(e) => {
                e.preventDefault();
                request('', 'PATCH', { name: newName });
              }}
            >
              <label className={`${formStyles.field} ${styles.growField}`}>
                Name
                <input
                  required
                  maxLength={100}
                  value={newName}
                  disabled={busy}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <button className={formStyles.submitBtn} disabled={busy || !newName.trim()}>
                Save name
              </button>
            </form>
          </section>
        </>
      )}
      {owner && (
        <>
          <section className={formStyles.section} aria-labelledby="transfer-ownership-title">
            <h2 id="transfer-ownership-title" className={formStyles.sectionTitle}>
              Transfer ownership
            </h2>
            <p className={formStyles.sectionNote}>
              The new owner gains full control. The previous owner becomes an Admin.
            </p>
            <form
              className={styles.settingsForm}
              onSubmit={(e) => {
                e.preventDefault();
                if (transferTo && confirm('Transfer ownership to this member?'))
                  request('/transfer', 'POST', { userId: transferTo });
              }}
            >
              <label className={`${formStyles.field} ${styles.growField}`}>
                New owner
                <select
                  required
                  value={transferTo}
                  disabled={busy || !members.some((m) => m.role !== 'OWNER')}
                  onChange={(e) => setTransferTo(e.target.value)}
                  aria-describedby="transfer-help"
                >
                  <option value="">Choose a member</option>
                  {members
                    .filter((m) => m.role !== 'OWNER')
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name || m.email}
                      </option>
                    ))}
                </select>
              </label>
              <button type="submit" className={formStyles.secondaryButton} disabled={busy || !transferTo}>
                Transfer ownership
              </button>
            </form>
            <p id="transfer-help" className={formStyles.sectionNote}>
              {members.some((m) => m.role !== 'OWNER')
                ? 'Choose an existing member to take over this workspace.'
                : 'Invite another member before transferring ownership.'}
            </p>
          </section>
          <section
            className={`${formStyles.section} ${formStyles.dangerSection}`}
            aria-labelledby="delete-workspace-title"
          >
            <h2 id="delete-workspace-title" className={formStyles.sectionTitle}>
              Delete workspace
            </h2>
            <p className={formStyles.sectionNote}>
              Permanently delete this workspace and its memberships.{' '}
              {hasContent
                ? 'Remove all nodes and lessons before deleting this workspace.'
                : 'Only empty workspaces can be deleted.'}
            </p>
            <div>
              <button
                type="button"
                className={formStyles.dangerButton}
                disabled={busy || hasContent}
                onClick={async () => {
                  if (confirm(`Permanently delete ${name}?`)) {
                    const result = await request('', 'DELETE');
                    if (result) router.push('/workspaces');
                  }
                }}
              >
                Delete workspace
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
