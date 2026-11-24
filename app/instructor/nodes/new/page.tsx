import NodeForm from '@/app/components/NodeForm/NodeForm';
import { requireInstructor } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import ContentDestination from '@/app/workspaces/ContentDestination';
export default async function NewNodePage() {
  const user = await requireInstructor();
  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id, role: { in: ['OWNER', 'ADMIN', 'EDITOR'] } } } },
    select: { id: true, name: true },
  });
  return (
    <>
      <ContentDestination kind="nodes" workspaces={workspaces} />
      <NodeForm mode="create" />
    </>
  );
}
