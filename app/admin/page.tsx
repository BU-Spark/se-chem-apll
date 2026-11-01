import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/server';
import { identitySelect } from '@/lib/auth/policy';
import RoleEditor from './RoleEditor';
import styles from './page.module.css';
export const dynamic = 'force-dynamic';
export default async function AdminPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = (params?.q ?? '').trim().slice(0, 200);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params?.page ?? '1', 10) || 1));
  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' as const } },
          { name: { contains: q, mode: 'insensitive' as const } },
          { clerkUserId: { equals: q } },
        ],
      }
    : {};
  const [users, count, audit] = await Promise.all([
    prisma.user.findMany({
      where,
      select: identitySelect,
      take: 50,
      skip: (page - 1) * 50,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }),
    prisma.user.count({ where }),
    prisma.roleAudit.findMany({
      where: { source: { in: ['ADMIN', 'BOOTSTRAP'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Users &amp; roles</h1>
        <p>Manage user roles and administrator access.</p>
      </header>
      <section className={styles.directory} aria-label="User directory">
        <div className={styles.toolbar}>
          <form className={styles.search}>
            <label className={styles.srOnly} htmlFor="user-search">
              Find a user
            </label>
            <input id="user-search" name="q" type="search" defaultValue={q} placeholder="Search by name or email…" />
            <button>Search</button>
            {q && (
              <Link href="/admin" className={styles.clearSearch}>
                Clear
              </Link>
            )}
          </form>
          <span className={styles.count}>
            {count} {count === 1 ? 'user' : 'users'}
          </span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.userColumn}>
                  User
                </th>
                <th scope="col">
                  <div className={styles.roleColumns}>
                    <span>Application role</span>
                    <span>Platform access</span>
                    <span className={styles.srOnly}>Action</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className={styles.userName}>
                      <strong>{user.name || user.email}</strong>
                      {!user.clerkUserId && <span className={styles.pendingBadge}>Not signed in</span>}
                    </div>
                    {user.name && <div className={styles.email}>{user.email}</div>}
                  </td>
                  <td>
                    <RoleEditor key={`${user.id}:${user.appRole}:${user.platformRole}`} user={user} />
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={2} className={styles.empty}>
                    No matching users. Try a different name or email.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className={styles.directoryFooter}>
          <p>Admin access is independent of the student or instructor role.</p>
          {(count > 50 || page > 1) && (
            <nav className={styles.pagination} aria-label="User pages">
              {page > 1 && <Link href={`/admin?q=${encodeURIComponent(q)}&page=${page - 1}`}>Previous</Link>}
              <span>Page {page}</span>
              {page * 50 < count && <Link href={`/admin?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next</Link>}
            </nav>
          )}
        </footer>
      </section>
      <details className={styles.audit}>
        <summary>
          Recent administrator role changes <span>{audit.length} recent</span>
        </summary>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Actor / target</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {entry.createdAt.toLocaleString('en-US', {
                      timeZone: 'UTC',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    {entry.actorId ?? 'Bootstrap command'}
                    <br />
                    Target: {entry.targetId}
                  </td>
                  <td>
                    {entry.previousAppRole ?? 'Unset'} → {entry.newAppRole ?? 'Unset'}
                    <br />
                    {entry.previousPlatformRole} → {entry.newPlatformRole}
                  </td>
                </tr>
              ))}
              {!audit.length && (
                <tr>
                  <td colSpan={3}>No administrator role changes yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
