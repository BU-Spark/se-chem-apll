import { nodeLibraryScope, lessonLibraryScope, workspaceAllows } from '@/lib/workspaces/permissions';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from '../../components/InstructorGrid/grid.module.css';
import { requireInstructor } from '@/lib/auth/server';
import { readNodeFilters, type SearchParams } from './listFilters';
import NodesGrid from './NodesGrid';

export const dynamic = 'force-dynamic';

export default async function NodesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const filters = readNodeFilters((await searchParams) ?? {});
  const user = await requireInstructor();
  const [availableNodes, lessons] = await Promise.all([
    prisma.node.findMany({
      where: nodeLibraryScope(user),
      select: {
        createdByClerkId: true,
        workspaceId: true,
        workspace: { select: { name: true, members: { where: { userId: user.id }, select: { role: true } } } },
        id: true,
        title: true,
        summary: true,
        tags: true,
        isDraft: true,
        createdAt: true,
        updatedAt: true,
        lessonNodes: {
          where: { lesson: lessonLibraryScope(user, 'content.edit', false) },
          select: { lesson: { select: { id: true, title: true } } },
        },
      },
      orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.lesson.findMany({
      where: lessonLibraryScope(user, 'content.edit', false),
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

      <p>
        <Link href="/instructor/copy?mode=nodes">Copy nodes from another course</Link>
      </p>
      <NodesGrid
        nodes={availableNodes.map((item) => ({
          ...item,
          canEdit:
            user.platformRole === 'ADMIN' ||
            (item.workspaceId
              ? workspaceAllows(item.workspace?.members[0]?.role ?? null, 'content.edit')
              : item.createdByClerkId === null || item.createdByClerkId === user.clerkUserId),
        }))}
        lessons={lessons}
        initialFilters={filters}
      />
    </div>
  );
}
