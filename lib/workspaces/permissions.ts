import type { Prisma, WorkspaceRole } from '@prisma/client';
import { canTeach, isAdmin, type Principal } from '@/lib/auth/policy';

export type WorkspacePermission =
  | 'content.read'
  | 'content.create'
  | 'content.edit'
  | 'content.delete'
  | 'members.invite'
  | 'members.remove'
  | 'members.assignRole'
  | 'workspace.update'
  | 'workspace.transferOwnership'
  | 'workspace.delete';
export function workspaceAllows(role: WorkspaceRole | null, permission: WorkspacePermission) {
  if (!role) return false;
  if (role === 'OWNER') return true;
  if (permission === 'workspace.transferOwnership' || permission === 'workspace.delete') return false;
  if (role === 'ADMIN') return true;
  if (permission === 'content.read') return true;
  return role === 'EDITOR' && (permission === 'content.create' || permission === 'content.edit');
}
export function canAssignRole(actor: WorkspaceRole, target: WorkspaceRole | null, next: WorkspaceRole) {
  if (target === 'OWNER' || next === 'OWNER') return false; // Only the ownership-transfer operation can change owners.
  return actor === 'OWNER' || (actor === 'ADMIN' && target !== 'ADMIN' && next !== 'ADMIN');
}
export function rolesFor(permission: WorkspacePermission): WorkspaceRole[] {
  return (['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const).filter((role) => workspaceAllows(role, permission));
}

// The workspace branch deliberately excludes the creator bypass. Attribution is not ownership.
export function libraryScope(user: Principal, permission: WorkspacePermission = 'content.read', seed = true) {
  if (isAdmin(user)) return {};
  const personal: { workspaceId: null; createdByClerkId: string | null }[] = [];
  if (canTeach(user)) personal.push({ workspaceId: null, createdByClerkId: user.clerkUserId });
  if (seed && canTeach(user)) personal.push({ workspaceId: null, createdByClerkId: null });
  return {
    OR: [...personal, { workspace: { members: { some: { userId: user.id, role: { in: rolesFor(permission) } } } } }],
  };
}
export function nodeLibraryScope(
  user: Principal,
  permission: WorkspacePermission = 'content.read',
  seed = true
): Prisma.NodeWhereInput {
  return libraryScope(user, permission, seed);
}
export function lessonLibraryScope(
  user: Principal,
  permission: WorkspacePermission = 'content.read',
  seed = true
): Prisma.LessonWhereInput {
  return libraryScope(user, permission, seed);
}
// Dependencies of a workspace lesson must be available to every member, including future members.
export function workspaceNodeScope(workspaceId: string): Prisma.NodeWhereInput {
  return { OR: [{ workspaceId }, { workspaceId: null, createdByClerkId: null }] };
}
