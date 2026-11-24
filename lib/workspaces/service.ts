import { createHash, randomBytes } from 'node:crypto';
import type { WorkspaceRole } from '@prisma/client';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { AuthError, isAdmin, type Principal } from '@/lib/auth/policy';
import { audit, lockWorkspace, lockLessons, lockNodes, requireWorkspace } from './access';
import { canAssignRole } from './permissions';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function inviteRole(value: unknown): Exclude<WorkspaceRole, 'OWNER'> {
  if (value !== 'ADMIN' && value !== 'EDITOR' && value !== 'VIEWER')
    throw new AuthError('Choose Admin, Editor, or Viewer.', 422);
  return value;
}
export async function createWorkspace(user: Principal, name: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
    throw new AuthError('Workspace name must be 1–100 characters.', 422);
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: { name: name.trim(), members: { create: { userId: user.id, role: 'OWNER' } } },
    });
    await audit(tx, workspace.id, user.id, 'workspace.created');
    return workspace;
  });
}
export async function inviteMember(user: Principal, workspaceId: string, email: unknown, value: unknown) {
  const role = inviteRole(value);
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    throw new AuthError('Enter a valid email.', 422);
  const normalized = email.trim().toLowerCase();
  const token = randomBytes(32).toString('hex');
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const workspace = await requireWorkspace(user, workspaceId, 'members.invite', tx);
    if (!isAdmin(user) && !canAssignRole(workspace.members[0].role, null, role))
      throw new AuthError('Only owners can appoint admins.', 403);
    if (await tx.workspaceMember.findFirst({ where: { workspaceId, user: { email: normalized } } }))
      throw new AuthError('This person is already a member.', 409);
    const pending = await tx.workspaceInvitation.findMany({
      where: { workspaceId, email: normalized, acceptedAt: null, revokedAt: null },
      select: { role: true },
    });
    if (!isAdmin(user) && pending.some((invite) => !canAssignRole(workspace.members[0].role, null, invite.role)))
      throw new AuthError('Only owners can replace Admin invitations.', 403);
    await tx.workspaceInvitation.updateMany({
      where: { workspaceId, email: normalized, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const invitation = await tx.workspaceInvitation.create({
      data: {
        workspaceId,
        email: normalized,
        role,
        tokenHash: hashToken(token),
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    await audit(tx, workspaceId, user.id, 'member.invited', invitation.id, { email: normalized, role });
    return { id: invitation.id, token, expiresAt: invitation.expiresAt };
  });
}
export async function acceptInvitation(user: Principal, token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new AuthError('Invitation not found.', 404);
  // Fetch current verified emails: the application email is a provisioning snapshot and may be stale.
  const profile = await currentUser();
  if (!profile || profile.id !== user.clerkUserId) throw new AuthError('Sign in again.', 401);
  const verifiedEmails = profile.emailAddresses
    .filter((e) => e.verification?.status === 'verified')
    .map((e) => e.emailAddress.trim().toLowerCase());
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invitation) throw new AuthError('Invitation not found.', 404);
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, invitation.workspaceId);
    const fresh = await tx.workspaceInvitation.findUnique({ where: { id: invitation.id } });
    if (!fresh || fresh.revokedAt || fresh.acceptedAt || fresh.expiresAt <= new Date())
      throw new AuthError('Invitation expired or is no longer available.', 410);
    if (!verifiedEmails.includes(fresh.email))
      throw new AuthError('Accept with an account whose verified email matches the invitation.', 403);
    // Recheck the inviter's authority: an outstanding invitation cannot outlive a demotion/removal.
    const inviter = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: fresh.workspaceId, userId: fresh.invitedById } },
    });
    const inviterUser = await tx.user.findUnique({ where: { id: fresh.invitedById }, select: { platformRole: true } });
    if (inviterUser?.platformRole !== 'ADMIN' && (!inviter || !canAssignRole(inviter.role, null, fresh.role)))
      throw new AuthError('The inviter no longer has permission. Request a new invitation.', 410);
    const existing = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: fresh.workspaceId, userId: user.id } },
    });
    if (existing) throw new AuthError('You are already a member.', 409);
    await tx.workspaceMember.create({ data: { workspaceId: fresh.workspaceId, userId: user.id, role: fresh.role } });
    await tx.workspaceInvitation.update({ where: { id: fresh.id }, data: { acceptedAt: new Date() } });
    await audit(tx, fresh.workspaceId, user.id, 'invitation.accepted', fresh.id, { role: fresh.role });
    return { workspaceId: fresh.workspaceId };
  });
}
export async function changeMember(
  user: Principal,
  workspaceId: string,
  targetId: string,
  next: unknown,
  remove = false
) {
  const role = remove ? 'VIEWER' : inviteRole(next);
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const workspace = await requireWorkspace(user, workspaceId, 'members.assignRole', tx);
    const key = { workspaceId_userId: { workspaceId, userId: targetId } };
    const target = await tx.workspaceMember.findUnique({ where: key });
    if (!target) throw new AuthError('Member not found.', 404);
    if (target.role === 'OWNER') throw new AuthError('Transfer ownership before changing the owner.', 409);
    if (!isAdmin(user) && !canAssignRole(workspace.members[0].role, target.role, role))
      throw new AuthError('Only owners can manage admins.', 403);
    if (remove) await tx.workspaceMember.delete({ where: key });
    else await tx.workspaceMember.update({ where: key, data: { role } });
    await tx.workspaceInvitation.updateMany({
      where: { workspaceId, invitedById: targetId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(tx, workspaceId, user.id, remove ? 'member.removed' : 'member.roleChanged', targetId, {
      previousRole: target.role,
      ...(remove ? {} : { role }),
    });
    return { ok: true };
  });
}
export async function transferOwnership(user: Principal, workspaceId: string, targetId: unknown) {
  if (typeof targetId !== 'string') throw new AuthError('Choose an existing member.', 422);
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    await requireWorkspace(user, workspaceId, 'workspace.transferOwnership', tx);
    const target = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetId } },
    });
    if (!target || target.role === 'OWNER') throw new AuthError('Choose another existing member.', 422);
    await tx.workspaceMember.updateMany({ where: { workspaceId, role: 'OWNER' }, data: { role: 'ADMIN' } });
    await tx.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetId } },
      data: { role: 'OWNER' },
    });
    await audit(tx, workspaceId, user.id, 'workspace.ownershipTransferred', targetId);
    return { ok: true };
  });
}

export async function movePersonalContent(user: Principal, workspaceId: string, body: Record<string, unknown>) {
  const parseIds = (value: unknown): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 200 || value.some((id) => typeof id !== 'string' || !id))
      throw new AuthError('Select up to 200 content items.', 422);
    return [...new Set(value)] as string[];
  };
  const nodeIds = parseIds(body.nodeIds),
    lessonIds = parseIds(body.lessonIds);
  if (!nodeIds.length && !lessonIds.length) throw new AuthError('Select content to move.', 422);
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    await requireWorkspace(user, workspaceId, 'content.create', tx);
    // Lock personal records before dependency checks; all moves use this deterministic order.
    await lockLessons(tx, lessonIds);
    await lockNodes(tx, nodeIds);
    const nodes = await tx.node.findMany({
      where: { id: { in: nodeIds }, workspaceId: null, createdByClerkId: user.clerkUserId },
    });
    const lessons = await tx.lesson.findMany({
      where: { id: { in: lessonIds }, workspaceId: null, createdByClerkId: user.clerkUserId },
      include: { lessonNodes: { include: { node: true } } },
    });
    if (nodes.length !== nodeIds.length || lessons.length !== lessonIds.length)
      throw new AuthError('Only your personal content can be moved.', 403);
    if (
      lessons.some((lesson) =>
        lesson.lessonNodes.some(
          ({ node }) =>
            node.workspaceId !== workspaceId &&
            !(node.workspaceId === null && node.createdByClerkId === null) &&
            !nodeIds.includes(node.id)
        )
      )
    )
      throw new AuthError('Select the lesson’s personal nodes too. Other instructors’ nodes cannot be moved.', 422);
    if (
      await tx.lessonNode.count({
        where: {
          nodeId: { in: nodeIds },
          lessonId: { notIn: lessonIds },
          lesson: { OR: [{ workspaceId: null }, { workspaceId: { not: workspaceId } }] },
        },
      })
    )
      throw new AuthError('Select every personal lesson using these nodes, or copy the content instead.', 409);
    await tx.node.updateMany({ where: { id: { in: nodeIds } }, data: { workspaceId } });
    await tx.lesson.updateMany({ where: { id: { in: lessonIds } }, data: { workspaceId } });
    await audit(tx, workspaceId, user.id, 'content.moved', undefined, { nodeIds, lessonIds });
    return { ok: true };
  });
}
