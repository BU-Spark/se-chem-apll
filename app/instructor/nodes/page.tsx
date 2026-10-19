import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from '../../components/InstructorGrid/grid.module.css';
import { requireInstructor, contentScope } from '@/lib/auth/server';
import { readNodeFilters, type SearchParams } from './listFilters';
import NodesGrid from './NodesGrid';

export const dynamic = 'force-dynamic';

export default async function NodesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const filters = readNodeFilters((await searchParams) ?? {});
  const user = await requireInstructor();
  const [availableNodes, lessons] = await Promise.all([
    prisma.node.findMany({
      where: { ...contentScope(user) },
      select: {
        id: true,
        title: true,
        summary: true,
        tags: true,
        isDraft: true,
        createdAt: true,
        updatedAt: true,
        lessonNodes: {
          where: { lesson: contentScope(user, false) },
          select: { lesson: { select: { id: true, title: true } } },
        },
      },
      orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.lesson.findMany({
      where: contentScope(user, false),
      select: { id: true, title: true, isDraft: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Nodes</h1>
        <Link href="/instructor/nodes/new" className={styles.createButton}>
          + New node
        </Link>
      </div>

      <NodesGrid nodes={availableNodes} lessons={lessons} initialFilters={filters} />
    </div>
  );
}
