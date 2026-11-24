/** @jest-environment node */
import { canAssignRole, rolesFor, workspaceAllows } from './permissions';
it('restricts content editing and deletion to the intended roles', () => {
  expect(rolesFor('content.read')).toEqual(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']);
  expect(rolesFor('content.edit')).toEqual(['OWNER', 'ADMIN', 'EDITOR']);
  expect(rolesFor('content.delete')).toEqual(['OWNER', 'ADMIN']);
  expect(rolesFor('workspace.transferOwnership')).toEqual(['OWNER']);
  expect(rolesFor('workspace.delete')).toEqual(['OWNER']);
  expect(workspaceAllows(null, 'content.read')).toBe(false);
});
it('prevents admin escalation and routes all ownership changes through transfer', () => {
  expect(canAssignRole('OWNER', 'ADMIN', 'EDITOR')).toBe(true);
  expect(canAssignRole('OWNER', null, 'ADMIN')).toBe(true);
  expect(canAssignRole('ADMIN', 'VIEWER', 'EDITOR')).toBe(true);
  expect(canAssignRole('ADMIN', 'ADMIN', 'VIEWER')).toBe(false);
  expect(canAssignRole('ADMIN', null, 'ADMIN')).toBe(false);
  expect(canAssignRole('EDITOR', null, 'VIEWER')).toBe(false);
  expect(canAssignRole('OWNER', 'OWNER', 'ADMIN')).toBe(false);
  expect(canAssignRole('OWNER', 'EDITOR', 'OWNER')).toBe(false);
});
