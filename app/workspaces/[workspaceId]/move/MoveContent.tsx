'use client';
import styles from '../../workspaces.module.css';
import formStyles from '@/app/components/InstructorForm/form.module.css';
import gridStyles from '@/app/components/InstructorGrid/grid.module.css';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function MoveContent({
  workspaceId,
  name,
  nodes,
  lessons,
}: {
  workspaceId: string;
  name: string;
  nodes: { id: string; title: string }[];
  lessons: { id: string; title: string; lessonNodes: { nodeId: string }[] }[];
}) {
  const router = useRouter();
  const [nodeIds, setNodes] = useState<string[]>([]);
  const [lessonIds, setLessons] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]);
  return (
    <div>
      <header className={formStyles.pageHeader}>
        <Link className={styles.backLink} href={`/workspaces/${workspaceId}`}>
          ← Back to library
        </Link>
        <h1 className={formStyles.pageTitle}>Move personal content</h1>
        <p className={formStyles.pageSubtitle}>Move selected nodes and lessons into {name}.</p>
      </header>
      <form
        className={formStyles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!confirm('Move this content into the workspace and let workspace membership control access?')) return;
          setBusy(true);
          setError('');
          try {
            const res = await fetch(`/api/workspaces/${workspaceId}/content`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nodeIds, lessonIds }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            router.push(`/workspaces/${workspaceId}`);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to move content.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className={formStyles.section}>
          <h2 className={formStyles.sectionTitle}>Sharing and dependencies</h2>
          <p className={formStyles.sectionNote}>
            Members gain access according to their workspace roles. If you leave, you lose access to this content.
            Moving content back to Personal is not supported.
          </p>
          <p className={formStyles.sectionNote}>
            Select each lesson and all its personal nodes together. Include every personal lesson using a selected node.
            Content IDs and course assignments stay the same.
          </p>
        </section>
        <section aria-labelledby="move-lessons-title">
          <h2 id="move-lessons-title" className={styles.tableHeading}>
            Lessons
          </h2>
          {lessons.length ? (
            <div className={gridStyles.tableScroll}>
              <table className={gridStyles.table}>
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Lesson</th>
                    <th>Node dependencies</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={busy}
                          aria-label={`Select lesson ${l.title || 'Untitled lesson'}`}
                          checked={lessonIds.includes(l.id)}
                          onChange={() => setLessons(toggle(lessonIds, l.id))}
                        />
                      </td>
                      <td>{l.title || 'Untitled lesson'}</td>
                      <td>
                        {l.lessonNodes
                          .map((row) => nodes.find((n) => n.id === row.nodeId)?.title || 'Seed or unavailable node')
                          .join(', ') || 'None'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={gridStyles.empty}>No personal lessons available to move.</p>
          )}
        </section>
        <section aria-labelledby="move-nodes-title">
          <h2 id="move-nodes-title" className={styles.tableHeading}>
            Nodes
          </h2>
          {nodes.length ? (
            <div className={gridStyles.tableScroll}>
              <table className={gridStyles.table}>
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Node</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((n) => (
                    <tr key={n.id}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={busy}
                          aria-label={`Select node ${n.title || 'Untitled node'}`}
                          checked={nodeIds.includes(n.id)}
                          onChange={() => setNodes(toggle(nodeIds, n.id))}
                        />
                      </td>
                      <td>{n.title || 'Untitled node'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={gridStyles.empty}>No personal nodes available to move.</p>
          )}
        </section>
        {error && (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        )}
        <footer className={formStyles.actions}>
          <Link className={formStyles.cancelLink} href={`/workspaces/${workspaceId}`}>
            Cancel
          </Link>
          <button className={formStyles.submitBtn} disabled={busy || (!nodeIds.length && !lessonIds.length)}>
            {busy ? 'Moving…' : `Move selected content (${nodeIds.length + lessonIds.length})`}
          </button>
        </footer>
      </form>
    </div>
  );
}
