import type { Prisma } from '@prisma/client';

export const bestSubmissionOrder = [
  { finalPercent: { sort: 'desc', nulls: 'last' } },
  { submittedAt: 'asc' },
  { number: 'asc' },
] satisfies Prisma.LessonSubmissionOrderByWithRelationInput[];
