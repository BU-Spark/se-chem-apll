import styles from '../workspaces.module.css';
import gridStyles from '@/app/components/InstructorGrid/grid.module.css';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAppUser } from '@/lib/auth/server';
import { canTeach, contentScope, isAdmin } from '@/lib/auth/policy';
import { requireWorkspace } from '@/lib/workspaces/access';
import { workspaceAllows } from '@/lib/workspaces/permissions';
import { workspacePageAccess } from '@/lib/workspaces/pages';
import WorkspaceSwitcher from '../WorkspaceSwitcher';
import WorkspaceLibrary from './WorkspaceLibrary';
export const dynamic = 'force-dynamic';
export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const user = await requireAppUser();
  const { workspaceId } = await params;
  const workspace = await workspacePageAccess(() => requireWorkspace(user, workspaceId, 'content.read'));
  const role = workspace.members[0]?.role ?? null;
  const canEdit = isAdmin(user) || workspaceAllows(role, 'content.edit');
  const canDelete = isAdmin(user) || workspaceAllows(role, 'content.delete');
  // Workspace membership grants content access, never access to another instructor's courses.
  const courseScope = canTeach(user) ? contentScope(user, false) : { id: { in: [] as string[] } };
  const [nodes, lessons, workspaces, courses] = await Promise.all([
    prisma.node.findMany({
      where: { workspaceId },
      select: {
        id: true,
        title: true,
        summary: true,
        tags: true,
        isDraft: true,
        createdAt: true,
        updatedAt: true,
        lessonNodes: { where: { lesson: { workspaceId } }, select: { lesson: { select: { id: true, title: true } } } },
      },
      orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.lesson.findMany({
      where: { workspaceId },
      select: {
        id: true,
        title: true,
        summary: true,
        isDraft: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { lessonNodes: true } },
        courseLessons: { where: { course: courseScope }, select: { course: { select: { id: true, title: true } } } },
      },
      orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.workspace.findMany({
      where: { members: { some: { userId: user.id } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.course.findMany({
      where: { ...courseScope, courseLessons: { some: { lesson: { workspaceId } } } },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
  ]);
  return (
    <>
      <header className={styles.workspaceHeader}>
        <div className={styles.workspaceToolbar}>
          <WorkspaceSwitcher current={workspaceId} workspaces={workspaces} />
          <span className={styles.roleBadge}>{role?.toLowerCase() ?? 'Platform admin'}</span>
        </div>
        <div className={styles.workspaceHeading}>
          <h1 className={gridStyles.title}>{workspace.name}</h1>
          <div className={styles.workspaceLinks}>
            <Link href={`/workspaces/${workspaceId}/members`}>Members and settings</Link>
            {canEdit && <Link href={`/workspaces/${workspaceId}/move`}>Move personal content here</Link>}
          </div>
        </div>
        <p className={styles.subtitle}>Edits update the shared content wherever it is used.</p>
      </header>
      <WorkspaceLibrary
        key={workspaceId}
        workspaceId={workspaceId}
        nodes={nodes.map((n) => ({ ...n, workspaceId, workspace: { name: workspace.name }, canEdit }))}
        lessons={lessons.map((l) => ({ ...l, workspaceId, workspace: { name: workspace.name }, canEdit }))}
        courses={courses}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
