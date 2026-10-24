import { NextResponse } from 'next/server';
import { apiAccess } from '@/lib/auth/api';
import { requireSameOrigin, roleBody } from '@/lib/auth/mutation';
import { changeRoles } from '@/lib/auth/roles';
import { AuthError } from '@/lib/auth/policy';
export async function PATCH(request: Request) {
  const access = await apiAccess();
  if (access.error) return access.error;
  try {
    requireSameOrigin(request);
    const patch = await roleBody(request);
    const user = await changeRoles(access.user.id, access.user.id, patch, 'DEBUG');
    return NextResponse.json(user, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
