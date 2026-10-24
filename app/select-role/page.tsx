import { requireAppUser, isAdmin } from '@/lib/auth/server';
import RoleSelector from './RoleSelector';
export default async function SelectRolePage() {
  const user = await requireAppUser();
  return <RoleSelector currentRole={user.appRole} clerkUserId={user.clerkUserId} admin={isAdmin(user)} />;
}
