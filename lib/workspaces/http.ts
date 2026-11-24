import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth/policy';
export async function workspaceResponse(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work());
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['P2002', 'P2003', 'P2025'].includes(String(error.code))
    )
      return NextResponse.json(
        { error: 'This operation conflicts with existing content or membership. Refresh and try again.' },
        { status: 409 }
      );
    throw error;
  }
}
export async function readObject(req: Request): Promise<Record<string, unknown>> {
  let value;
  try {
    value = await req.json();
  } catch {
    throw new AuthError('Invalid JSON', 400);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError('Expected an object.', 422);
  return value;
}

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  throw error;
}
