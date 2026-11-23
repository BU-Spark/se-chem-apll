import { apiAccess } from '@/lib/auth/api';
import { AuthError, isAdmin } from '@/lib/auth/policy';
import { prisma } from '@/lib/prisma';
import { audit, lockWorkspace, requireWorkspace } from '@/lib/workspaces/access';
import { canAssignRole } from '@/lib/workspaces/permissions';
import { workspaceResponse } from '@/lib/workspaces/http';
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ workspaceId: string; invitationId: string }> }
) {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(async () => {
    const { workspaceId, invitationId } = await params;
    return prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, workspaceId);
      const workspace = await requireWorkspace(user, workspaceId, 'members.invite', tx);
      const invitation = await tx.workspaceInvitation.findFirst({
        where: { id: invitationId, workspaceId, acceptedAt: null, revokedAt: null },
      });
      if (!invitation) throw new AuthError('Invitation not found.', 404);
      if (!isAdmin(user) && !canAssignRole(workspace.members[0].role, null, invitation.role))
        throw new AuthError('Forbidden', 403);
      await tx.workspaceInvitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
      await audit(tx, workspaceId, user.id, 'invitation.revoked', invitationId);
      return { ok: true };
    });
  });
}
