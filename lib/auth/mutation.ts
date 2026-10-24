import { AuthError } from './policy';

// These cookie-authenticated endpoints are used exclusively by our same-origin UI.
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = process.env.APP_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const expected = allowed?.length ? allowed : [new URL(request.url).origin];
  if (!origin || !expected.includes(origin) || request.headers.get('sec-fetch-site') === 'cross-site')
    throw new AuthError('Cross-origin request rejected.', 403);
}
export async function roleBody(request: Request, admin = false) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AuthError('Invalid JSON.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AuthError('Invalid role update.', 400);
  const row = body as Record<string, unknown>;
  const keys = Object.keys(row);
  if (!keys.length || keys.some((key) => key !== 'appRole' && !(admin && key === 'platformRole')))
    throw new AuthError('Only role fields are accepted.', 400);
  if ('appRole' in row && row.appRole !== null && row.appRole !== 'STUDENT' && row.appRole !== 'INSTRUCTOR')
    throw new AuthError('Invalid application role.', 400);
  if ('platformRole' in row && row.platformRole !== 'MEMBER' && row.platformRole !== 'ADMIN')
    throw new AuthError('Invalid platform role.', 400);
  return row as { appRole?: 'STUDENT' | 'INSTRUCTOR' | null; platformRole?: 'MEMBER' | 'ADMIN' };
}
