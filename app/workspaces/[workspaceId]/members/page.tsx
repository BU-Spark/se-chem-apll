import { prisma } from '@/lib/prisma';
import { requireAppUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/policy';
import { requireWorkspace } from '@/lib/workspaces/access';
import { workspacePageAccess } from '@/lib/workspaces/pages';
import Members from './Members';
export default async function MembersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const user = await requireAppUser();
  const { workspaceId } = await params;
  const workspace = await workspacePageAccess(() => requireWorkspace(user, workspaceId, 'content.read'));
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const role = workspace.members[0]?.role ?? null;
  const invitations =
    role === 'OWNER' || role === 'ADMIN' || isAdmin(user)
      ? await prisma.workspaceInvitation.findMany({
          where: { workspaceId, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, email: true, role: true, expiresAt: true },
        })
      : [];
  const counts = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { _count: { select: { nodes: true, lessons: true } } },
  });
  return (
    <Members
      workspaceId={workspaceId}
      name={workspace.name}
      role={role}
      platformAdmin={isAdmin(user)}
      hasContent={counts._count.nodes > 0 || counts._count.lessons > 0}
      members={members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role }))}
      invitations={invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
    />
  );
}
