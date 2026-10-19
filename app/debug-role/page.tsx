import { requireAppUser, isAdmin } from '@/lib/auth/server';
import RoleSelector from '../select-role/RoleSelector';
export default async function DebugRolePage() {
  const user = await requireAppUser();
  return <RoleSelector currentRole={user.appRole} clerkUserId={user.clerkUserId} admin={isAdmin(user)} debug />;
}
