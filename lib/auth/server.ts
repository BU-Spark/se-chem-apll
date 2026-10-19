import { redirect } from 'next/navigation';
import { getAppUser } from './identity';
import { AuthError, canTeach, homeFor, isAdmin } from './policy';
export { contentScope, isAdmin, homeFor } from './policy';
export { getAppUser } from './identity';

export async function requireAppUser() {
  let user;
  try {
    user = await getAppUser();
  } catch (error) {
    if (error instanceof AuthError) redirect(`/account-setup?reason=${error.status}`);
    throw error;
  }
  if (!user) redirect('/sign-in');
  return user;
}
export async function requireInstructor() {
  const user = await requireAppUser();
  if (!canTeach(user)) redirect(homeFor(user));
  return user;
}
export async function requireAdmin() {
  const user = await requireAppUser();
  if (!isAdmin(user)) redirect(homeFor(user));
  return user;
}
export async function requireStudent() {
  const user = await requireAppUser();
  if (user.appRole !== 'STUDENT') redirect(isAdmin(user) ? '/select-role' : homeFor(user));
  return user;
}
