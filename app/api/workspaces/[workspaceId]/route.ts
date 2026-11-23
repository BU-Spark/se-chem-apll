import { apiAccess } from '@/lib/auth/api';
import { AuthError } from '@/lib/auth/policy';
import { prisma } from '@/lib/prisma';
import { audit, lockWorkspace, requireWorkspace } from '@/lib/workspaces/access';
import { readObject, workspaceResponse } from '@/lib/workspaces/http';
type Context = { params: Promise<{ workspaceId: string }> };
export async function PATCH(req: Request, { params }: Context) {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(async () => {
    const { workspaceId } = await params;
    const { name } = await readObject(req);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
      throw new AuthError('Name must be 1–100 characters.', 422);
    return prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, workspaceId);
      await requireWorkspace(user, workspaceId, 'workspace.update', tx);
      const result = await tx.workspace.update({ where: { id: workspaceId }, data: { name: name.trim() } });
      await audit(tx, workspaceId, user.id, 'workspace.updated', undefined, { name: name.trim() });
      return result;
    });
  });
}
export async function DELETE(_req: Request, { params }: Context) {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(async () => {
    const { workspaceId } = await params;
    return prisma.$transaction(async (tx) => {
      await lockWorkspace(tx, workspaceId);
      await requireWorkspace(user, workspaceId, 'workspace.delete', tx);
      if ((await tx.node.count({ where: { workspaceId } })) || (await tx.lesson.count({ where: { workspaceId } })))
        throw new AuthError('Move or delete workspace content before deleting the workspace.', 409);
      await audit(tx, workspaceId, user.id, 'workspace.deleted');
      await tx.workspace.delete({ where: { id: workspaceId } });
      return { ok: true };
    });
  });
}
