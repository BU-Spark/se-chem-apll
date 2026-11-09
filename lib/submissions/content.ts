import { createHash } from 'node:crypto';
import type { Prisma, AttemptKind } from '@prisma/client';
import { quizVariantOptions, renderQuestionVariant } from '@/app/utils/questionVariants';

export const nodeContentInclude = {
  quizQuestions: {
    orderBy: { sortOrder: 'asc' as const },
    include: { variants: { orderBy: { sortOrder: 'asc' as const } } },
  },
  checkpoints: {
    orderBy: { sortOrder: 'asc' as const },
    include: { questions: { where: { kind: 'QUESTION' as const }, orderBy: { sortOrder: 'asc' as const } } },
  },
};
export const workNodeInclude = { node: { include: nodeContentInclude } };
export type WorkNode = Prisma.LessonNodeGetPayload<{ include: typeof workNodeInclude }>;
// Reconstruct the old numeric JSON representation for hashing, so the storage-only
// migration does not invalidate an in-progress attempt. PostgreSQL JSONB orders
// object keys by UTF-8 byte length, then byte value.
function jsonbOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbOrder);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(
          ([a], [b]) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b))
        )
        .map(([key, item]) => [key, jsonbOrder(item)])
    );
  return value;
}
export function nodeKey(node: WorkNode) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: node.id,
        passingPercent: node.passingPercent,
        quizQuestionCount: node.quizQuestionCount,
        title: node.node.title,
        quiz: node.node.quizQuestions.map((q) => {
          const { variants, ...question } = q;
          if (variants?.length && quizVariantOptions(q)?.type === 'variantShortAnswer') {
            return {
              ...question,
              options: jsonbOrder({
                type: 'variantShortAnswer',
                version: 1,
                variants: variants.map((row) => ({
                  id: row.id.startsWith(`${q.id}:`) ? row.id.slice(q.id.length + 1) : row.id,
                  values: row.values,
                  answer: row.answer,
                })),
              }),
            };
          }
          const options = q.options as {
            type?: string;
            version?: number;
            legacyChoices?: { id: string; content: string }[];
          };
          if (
            options.type === 'variantMultipleChoice' &&
            options.version === 2 &&
            Array.isArray(options.legacyChoices)
          ) {
            const legacyChoices = options.legacyChoices;
            const unchanged = variants.every((row) => {
              const answer = row.answer as { choices?: { id: string; content: string }[] };
              return (
                JSON.stringify(answer.choices?.map((c) => [c.id, c.content])) ===
                JSON.stringify(
                  legacyChoices.map((c) => [
                    c.id,
                    renderQuestionVariant(c.content, row.values as Record<string, string>),
                  ])
                )
              );
            });
            if (unchanged) {
              const original = {
                ...question,
                options: jsonbOrder({ type: 'variantMultipleChoice', version: 1, choices: legacyChoices }),
              };
              return variants.length
                ? {
                    ...original,
                    variants: variants.map((row) => ({
                      ...row,
                      answer: jsonbOrder({
                        type: 'multipleChoice',
                        correctChoiceIds: (row.answer as { correctChoiceIds: string[] }).correctChoiceIds,
                      }),
                    })),
                  }
                : original;
            }
          }
          return variants?.length ? q : question;
        }),
        checkpoints: node.node.checkpoints,
      })
    )
    .digest('hex');
}
export function requiredKinds(node: WorkNode): AttemptKind[] {
  const types: AttemptKind[] = [];
  if (node.node.quizQuestions.length) types.push('QUIZ');
  if (node.node.checkpoints.some((c) => c.questions.length)) types.push('CHECKPOINT');
  return types.length ? types : ['REVIEW'];
}
