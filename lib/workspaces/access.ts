import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthError, canTeach, isAdmin, type Principal } from '@/lib/auth/policy';
import { workspaceAllows, type WorkspacePermission } from './permissions';

export async function requireWorkspace(
  user: Principal,
  workspaceId: string,
  permission: WorkspacePermission,
  db: Prisma.TransactionClient = prisma
) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: { members: { where: { userId: user.id } } },
  });
  if (!workspace || (!workspace.members.length && !isAdmin(user))) throw new AuthError('Workspace not found.', 404);
  if (!isAdmin(user) && !workspaceAllows(workspace.members[0]?.role ?? null, permission))
    throw new AuthError('Forbidden', 403);
  return workspace;
}
export async function creationWorkspace(user: Principal, value: unknown, db: Prisma.TransactionClient = prisma) {
  if (value === undefined || value === null) {
    if (!canTeach(user)) throw new AuthError('Choose a workspace to create content.', 403);
    return null;
  }
  if (typeof value !== 'string' || !value) throw new AuthError('Invalid workspace.', 422);
  await requireWorkspace(user, value, 'content.create', db);
  return value;
}
export async function assertContentPermission(
  user: Principal,
  content: { workspaceId: string | null },
  permission: WorkspacePermission,
  db: Prisma.TransactionClient = prisma
) {
  if (content.workspaceId) await requireWorkspace(user, content.workspaceId, permission, db);
  else if (!canTeach(user)) throw new AuthError('Forbidden', 403);
}
export async function audit(
  db: Prisma.TransactionClient,
  workspaceId: string,
  actorId: string,
  action: string,
  targetId?: string,
  details?: Prisma.InputJsonValue
) {
  await db.workspaceAudit.create({ data: { workspaceId, actorId, action, targetId, details } });
}
// Serializes workspace changes while allowing foreign-key checks from content writes.
export async function lockWorkspace(db: Prisma.TransactionClient, workspaceId: string) {
  await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
}

// All dependency writers lock lessons before nodes, with IDs sorted within each table.
// Re-read authorization and dependencies after acquiring these transaction-scoped locks.
export async function lockLessons(db: Prisma.TransactionClient, ids: string[]) {
  await db.$queryRaw`SELECT id FROM "Lesson" WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
}
export async function lockNodes(db: Prisma.TransactionClient, ids: string[]) {
  await db.$queryRaw`SELECT id FROM "Node" WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
}
