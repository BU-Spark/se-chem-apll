import { NextResponse } from 'next/server';
import { apiAccess } from '@/lib/auth/api';
import { requireSameOrigin, roleBody } from '@/lib/auth/mutation';
import { changeRoles } from '@/lib/auth/roles';
import { AuthError } from '@/lib/auth/policy';
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const access = await apiAccess('admin');
  if (access.error) return access.error;
  try {
    requireSameOrigin(request);
    const patch = await roleBody(request, true);
    const user = await changeRoles(access.user.id, (await params).userId, patch, 'ADMIN');
    return NextResponse.json(user, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
