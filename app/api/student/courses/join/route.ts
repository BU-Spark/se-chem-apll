import { NextResponse } from 'next/server';
import { apiAccess } from '@/lib/auth/api';
import { requireSameOrigin } from '@/lib/auth/mutation';
import { AuthError } from '@/lib/auth/policy';
import { joinCourse } from '@/lib/courseJoin';

export async function POST(request: Request) {
  const { user, error } = await apiAccess('student');
  if (error) return error;

  try {
    requireSameOrigin(request);
    const body = await request.json().catch(() => null);
    return NextResponse.json(await joinCourse(user.id, body?.code));
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to join the course. Please try again.' }, { status: 500 });
  }
}
