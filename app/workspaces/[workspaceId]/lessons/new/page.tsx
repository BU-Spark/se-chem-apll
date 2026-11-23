import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAppUser } from '@/lib/auth/server';
import { requireWorkspace } from '@/lib/workspaces/access';
import { workspacePageAccess } from '@/lib/workspaces/pages';
import { workspaceNodeScope } from '@/lib/workspaces/permissions';
import LessonCreateForm from '@/app/instructor/lessons/new/LessonCreateForm';
export default async function NewWorkspaceLesson({ params }: { params: Promise<{ workspaceId: string }> }) {
  const user = await requireAppUser();
  const { workspaceId } = await params;
  const workspace = await workspacePageAccess(() => requireWorkspace(user, workspaceId, 'content.create'));
  const nodes = await prisma.node.findMany({
    where: { isDraft: false, ...workspaceNodeScope(workspaceId) },
    include: { _count: { select: { quizQuestions: true, checkpoints: true } } },
    orderBy: { title: 'asc' },
  });
  return (
    <>
      <p>
        Creating in {workspace.name} · <Link href="/workspaces">Change workspace</Link>
      </p>
      <LessonCreateForm
        workspaceId={workspaceId}
        returnTo={`/workspaces/${workspaceId}`}
        availableNodes={nodes.map((n) => ({
          id: n.id,
          title: n.title,
          summary: n.summary,
          quizBankCount: n._count.quizQuestions,
          checkpointCount: n._count.checkpoints,
        }))}
      />
    </>
  );
}
