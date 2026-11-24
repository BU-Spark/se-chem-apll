import { prisma } from '@/lib/prisma';
import { requireAppUser } from '@/lib/auth/server';
import { requireWorkspace } from '@/lib/workspaces/access';
import { workspacePageAccess } from '@/lib/workspaces/pages';
import MoveContent from './MoveContent';
export default async function MovePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const user = await requireAppUser();
  const { workspaceId } = await params;
  const workspace = await workspacePageAccess(() => requireWorkspace(user, workspaceId, 'content.create'));
  const [nodes, lessons] = await Promise.all([
    prisma.node.findMany({
      where: { workspaceId: null, createdByClerkId: user.clerkUserId },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
    prisma.lesson.findMany({
      where: { workspaceId: null, createdByClerkId: user.clerkUserId },
      select: { id: true, title: true, lessonNodes: { select: { nodeId: true } } },
      orderBy: { title: 'asc' },
    }),
  ]);
  return <MoveContent workspaceId={workspaceId} name={workspace.name} nodes={nodes} lessons={lessons} />;
}
