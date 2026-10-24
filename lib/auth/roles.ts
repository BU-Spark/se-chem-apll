import type { AppRole, PlatformRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthError, identitySelect } from './policy';

export async function changeRoles(
  actorId: string,
  targetId: string,
  patch: { appRole?: AppRole | null; platformRole?: PlatformRole },
  source: 'ADMIN' | 'DEBUG'
) {
  return prisma.$transaction(async (tx) => {
    // Serialize role writes across replicas. Also used by the bootstrap CLI.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(261015, 1)::text`;
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || (source === 'ADMIN' && actor.platformRole !== 'ADMIN')) throw new AuthError('Forbidden', 403);
    if (source === 'DEBUG' && (actorId !== targetId || patch.platformRole !== undefined))
      throw new AuthError('Forbidden', 403);
    const target = await tx.user.findUnique({ where: { id: targetId } });
    if (!target) throw new AuthError('User not found.', 404);
    if (patch.platformRole === 'ADMIN' && !target.clerkUserId)
      throw new AuthError('The user must sign in before becoming an admin.', 409);
    if (
      target.platformRole === 'ADMIN' &&
      patch.platformRole === 'MEMBER' &&
      (await tx.user.count({ where: { platformRole: 'ADMIN' } })) <= 1
    )
      throw new AuthError('The last admin cannot be removed.', 409);
    const updated = await tx.user.update({ where: { id: targetId }, data: patch, select: identitySelect });
    if (updated.appRole !== target.appRole || updated.platformRole !== target.platformRole) {
      await tx.roleAudit.create({
        data: {
          actorId,
          targetId,
          source,
          previousAppRole: target.appRole,
          newAppRole: updated.appRole,
          previousPlatformRole: target.platformRole,
          newPlatformRole: updated.platformRole,
        },
      });
    }
    return updated;
  });
}
