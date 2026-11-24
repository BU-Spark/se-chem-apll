import type { Prisma } from '@prisma/client';
import { requireWorkspace } from '@/lib/workspaces/access';
import { AuthError } from './policy';
import { prisma } from '@/lib/prisma';
import type { Principal } from './policy';
import { lessonLibraryScope, nodeLibraryScope, workspaceNodeScope } from '@/lib/workspaces/permissions';
export async function referencedContentAllowed(
  kind: 'lesson' | 'node',
  ids: string[],
  user: Principal,
  workspaceId?: string | null,
  db: Prisma.TransactionClient = prisma
) {
  const unique = [...new Set(ids)];
  if (!unique.length) return true;
  if (kind === 'lesson')
    return (await db.lesson.count({ where: { id: { in: unique }, ...lessonLibraryScope(user) } })) === unique.length;
  if (workspaceId) {
    try {
      await requireWorkspace(user, workspaceId, 'content.read', db);
    } catch (error) {
      if (error instanceof AuthError) return false;
      throw error;
    }
  }
  const scope = workspaceId
    ? workspaceNodeScope(workspaceId)
    : workspaceId === null
      ? { AND: [nodeLibraryScope(user), { workspaceId: null }] }
      : nodeLibraryScope(user);
  return (await db.node.count({ where: { id: { in: unique }, ...scope } })) === unique.length;
}
