import formStyles from '@/app/components/InstructorForm/form.module.css';
import gridStyles from '@/app/components/InstructorGrid/grid.module.css';
import workspaceStyles from '@/app/workspaces/workspaces.module.css';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/workspaces/access';
import { workspacePageAccess } from '@/lib/workspaces/pages';
import { workspaceAllows, workspaceNodeScope } from '@/lib/workspaces/permissions';
import { isAdmin } from '@/lib/auth/policy';
import { lessonLibraryScope } from '@/lib/workspaces/permissions';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { requireAppUser } from '@/lib/auth/server';
import LessonEditForm from '@/app/instructor/lessons/[lessonId]/edit/LessonEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ workspaceId: string; lessonId: string }>;
}

export default async function EditLessonPage({ params }: Props) {
  const { lessonId, workspaceId } = await params;
  const user = await requireAppUser();

  const lesson = await prisma.lesson.findFirst({
    where: {
      id: lessonId,
      workspaceId,
      ...lessonLibraryScope(user),
    },
    include: {
      lessonNodes: {
        include: { node: true },
        orderBy: { sortOrder: 'asc' },
      },
      lessonNodeEdges: {
        select: { id: true, sourceId: true, targetId: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!lesson) {
    notFound();
  }

  const workspace = await workspacePageAccess(() => requireWorkspace(user, workspaceId, 'content.read'));
  const editable = isAdmin(user) || workspaceAllows(workspace.members[0]?.role ?? null, 'content.edit');
  if (!editable)
    return (
      <div className={formStyles.form}>
        <header className={formStyles.pageHeader}>
          <Link className={workspaceStyles.backLink} href={`/workspaces/${workspaceId}`}>
            ← Back to library
          </Link>
          <h1 className={formStyles.pageTitle}>{lesson.title || 'Untitled lesson'}</h1>
          <p className={formStyles.pageSubtitle}>Read-only access · {lesson.isDraft ? 'Draft' : 'Published'}</p>
        </header>
        <section className={formStyles.section}>
          <h2 className={formStyles.sectionTitle}>Lesson details</h2>
          <p>{lesson.summary}</p>
          <p>{lesson.description}</p>
        </section>
        <section>
          <h2 className={workspaceStyles.tableHeading}>Nodes</h2>
          <div className={gridStyles.tableScroll}>
            <table className={gridStyles.table}>
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Pass threshold</th>
                </tr>
              </thead>
              <tbody>
                {lesson.lessonNodes.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.node.workspaceId ? (
                        <Link className={gridStyles.titleLink} href={`/workspaces/${workspaceId}/nodes/${row.node.id}`}>
                          {row.node.title}
                        </Link>
                      ) : (
                        row.node.title
                      )}
                    </td>
                    <td>{row.passingPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  const nodes = await prisma.node.findMany({
    where: {
      isDraft: false,
      ...workspaceNodeScope(workspaceId),
    },
    include: {
      _count: { select: { quizQuestions: true, checkpoints: true } },
    },
    orderBy: { title: 'asc' },
  });
  const paletteNodes = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    quizBankCount: n._count.quizQuestions,
    checkpointCount: n._count.checkpoints,
  }));

  return (
    <LessonEditForm
      returnTo={`/workspaces/${workspaceId}`}
      canDelete={isAdmin(user) || workspaceAllows(workspace.members[0]?.role ?? null, 'content.delete')}
      lesson={lesson}
      availableNodes={paletteNodes}
    />
  );
}
