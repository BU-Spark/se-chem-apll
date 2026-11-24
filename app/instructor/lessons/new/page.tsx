import ContentDestination from '@/app/workspaces/ContentDestination';
import { prisma } from '@/lib/prisma';
import LessonCreateForm from './LessonCreateForm';
import { requireInstructor, contentScope } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function NewLessonPage() {
  const user = await requireInstructor();
  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id, role: { in: ['OWNER', 'ADMIN', 'EDITOR'] } } } },
    select: { id: true, name: true },
  });
  const nodes = await prisma.node.findMany({
    where: {
      isDraft: false,
      ...contentScope(user),
      workspaceId: null,
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
    <>
      <ContentDestination kind="lessons" workspaces={workspaces} />
      <LessonCreateForm availableNodes={paletteNodes} />
    </>
  );
}
