import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function NodesPage() {
  const nodes = await prisma.node.findMany({
    include: { questions: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Nodes</h1>
        <Link href="/instructor/nodes/new" className={styles.createButton}>
          + New node
        </Link>
      </div>

      {nodes.length === 0 ? (
        <p className={styles.empty}>No nodes yet. Create your first one above.</p>
      ) : (
        <ul className={styles.list}>
          {nodes.map((node) => {
            const preLectureCount = node.questions.filter((q) => q.isPreLecture).length;
            return (
              <li key={node.id} className={styles.card}>
                <div className={styles.cardBody}>
                  <div className={styles.cardTitleRow}>
                    <p className={styles.cardTitle}>{node.title}</p>
                    {preLectureCount > 0 && <span className={styles.preQuizBadge}>Pre-quiz</span>}
                  </div>
                  {node.summary && <p className={styles.cardSummary}>{node.summary}</p>}
                  <p className={styles.cardMeta}>
                    {node.questions.length} question{node.questions.length !== 1 ? 's' : ''} &middot; Pass:{' '}
                    {node.defaultPassingPercent}%{node.videoUrl && ' · Video attached'}
                  </p>
                </div>
                <Link href={`/instructor/nodes/${node.id}/edit`} className={styles.editLink}>
                  Edit
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
