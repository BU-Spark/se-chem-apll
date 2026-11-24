import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAppUser } from '@/lib/auth/server';
import gridStyles from '@/app/components/InstructorGrid/grid.module.css';
import WorkspacesGrid from './WorkspacesGrid';
export const dynamic = 'force-dynamic';
export default async function WorkspacesPage() {
  const user = await requireAppUser();
  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    include: { members: { where: { userId: user.id } }, _count: { select: { nodes: true, lessons: true } } },
    orderBy: { name: 'asc' },
  });
  return (
    <div>
      <header className={gridStyles.header}>
        <h1 className={gridStyles.title}>Workspaces</h1>
        <Link href="/workspaces/new" className={gridStyles.createButton}>
          + New workspace
        </Link>
      </header>
      <WorkspacesGrid
        workspaces={workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          role: w.members[0].role.charAt(0) + w.members[0].role.slice(1).toLowerCase(),
          nodeCount: w._count.nodes,
          lessonCount: w._count.lessons,
          updatedAt: w.updatedAt,
        }))}
      />
    </div>
  );
}
