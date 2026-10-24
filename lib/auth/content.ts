import { prisma } from '@/lib/prisma';
import { contentScope, type Principal } from './policy';
export async function referencedContentAllowed(kind: 'lesson' | 'node', ids: string[], user: Principal) {
  const unique = [...new Set(ids)];
  if (!unique.length) return true;
  const where = { id: { in: unique }, ...contentScope(user) };
  const count = kind === 'lesson' ? await prisma.lesson.count({ where }) : await prisma.node.count({ where });
  return count === unique.length;
}
