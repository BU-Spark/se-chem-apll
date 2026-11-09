import { NextResponse } from 'next/server';
import { apiAccess } from '@/lib/auth/api';
import { requireSameOrigin } from '@/lib/auth/mutation';
import { AuthError } from '@/lib/auth/policy';
import { setCourseJoinCode } from '@/lib/courseJoin';

type Context = { params: Promise<{ courseId: string }> };

async function updateCode(request: Request, { params }: Context, enabled: boolean) {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  try {
    requireSameOrigin(request);
    const { courseId } = await params;
    return NextResponse.json(await setCourseJoinCode(user, courseId, enabled), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to update the course code. Please try again.' }, { status: 500 });
  }
}

export function POST(request: Request, context: Context) {
  return updateCode(request, context, true);
}

export function DELETE(request: Request, context: Context) {
  return updateCode(request, context, false);
}
