import { NextResponse } from 'next/server';
import { getAppUser } from './identity';
import { AuthError, canTeach, isAdmin, type Principal } from './policy';
export { contentScope } from './policy';

type Access = { user: Principal; userId: string; error: null } | { user: null; userId: null; error: NextResponse };
export async function apiAccess(kind: 'member' | 'instructor' | 'admin' | 'student' = 'member'): Promise<Access> {
  try {
    const user = await getAppUser();
    if (!user) throw new AuthError('Unauthorized', 401);
    if (
      (kind === 'instructor' && !canTeach(user)) ||
      (kind === 'admin' && !isAdmin(user)) ||
      (kind === 'student' && user.appRole !== 'STUDENT')
    )
      throw new AuthError('Forbidden', 403);
    return { user, userId: user.clerkUserId, error: null };
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    return { user: null, userId: null, error: NextResponse.json({ error: error.message }, { status: error.status }) };
  }
}
