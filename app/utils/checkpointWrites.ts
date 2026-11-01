import { Prisma } from '@prisma/client';
import type { serializeCheckpointCreate, serializeCheckpointQuestionCreate } from './nodeContent';

export type CheckpointCreate = ReturnType<typeof serializeCheckpointCreate>;
export type CheckpointMetadata = Omit<CheckpointCreate, 'questions'>;
export type ItemData = ReturnType<typeof serializeCheckpointQuestionCreate>;

// Bound both row count and JSON parameter size. A single large row remains indivisible.
export const CHECKPOINT_BATCH_ROWS = 500;
const MAX_BATCH_BYTES = 1024 * 1024;
export function* checkpointBatches<T>(rows: Iterable<T>): Generator<T[]> {
  let batch: T[] = [];
  let bytes = 2;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row), 'utf8') + 1;
    if (batch.length && (batch.length >= CHECKPOINT_BATCH_ROWS || bytes + size > MAX_BATCH_BYTES)) {
      yield batch;
      batch = [];
      bytes = 2;
    }
    batch.push(row);
    bytes += size;
  }
  if (batch.length) yield batch;
}

export async function updateCheckpointRows(
  tx: Prisma.TransactionClient,
  nodeId: string,
  changes: Map<string, Partial<CheckpointMetadata>>
) {
  const rows = [...changes].map(([id, data]) => ({
    id,
    ...data,
    setOrder: 'sortOrder' in data,
    setKey: 'checkpointKey' in data,
    setTime: 'timeOffsetSeconds' in data,
    setHint: 'placementHint' in data,
  }));
  for (const batch of checkpointBatches(rows)) {
    const updated = await tx.$executeRaw(Prisma.sql`
      UPDATE "NodeCheckpoint" AS c SET
        "sortOrder" = CASE WHEN v."setOrder" THEN v."sortOrder" ELSE c."sortOrder" END,
        "checkpointKey" = CASE WHEN v."setKey" THEN v."checkpointKey" ELSE c."checkpointKey" END,
        "timeOffsetSeconds" = CASE WHEN v."setTime" THEN v."timeOffsetSeconds" ELSE c."timeOffsetSeconds" END,
        "placementHint" = CASE WHEN v."setHint" THEN v."placementHint" ELSE c."placementHint" END,
        "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS v(
        "id" text, "sortOrder" integer, "checkpointKey" text, "timeOffsetSeconds" integer,
        "placementHint" text, "setOrder" boolean, "setKey" boolean, "setTime" boolean, "setHint" boolean
      )
      WHERE c."id" = v."id" AND c."nodeId" = ${nodeId}
    `);
    if (updated !== batch.length) throw new Error('Checkpoint records changed during saving. Reload before saving.');
  }
}

export async function updateQuestionRows(
  tx: Prisma.TransactionClient,
  nodeId: string,
  changes: Map<string, ItemData | { sortOrder: number }>
) {
  const rows = [...changes].map(([id, data]) => ({ id, ...data, setContent: 'prompt' in data }));
  for (const batch of checkpointBatches(rows)) {
    const updated = await tx.$executeRaw(Prisma.sql`
      UPDATE "CheckpointQuestion" AS q SET
        "sortOrder" = v."sortOrder",
        "kind" = CASE WHEN v."setContent" THEN v."kind"::"CheckpointQuestionKind" ELSE q."kind" END,
        "prompt" = CASE WHEN v."setContent" THEN v."prompt" ELSE q."prompt" END,
        "options" = CASE WHEN v."setContent" THEN v."options" ELSE q."options" END,
        "correctIndices" = CASE WHEN v."setContent" THEN v."correctIndices" ELSE q."correctIndices" END,
        "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS v(
        "id" text, "sortOrder" integer, "kind" text, "prompt" text,
        "options" jsonb, "correctIndices" integer[], "setContent" boolean
      )
      WHERE q."id" = v."id" AND q."checkpointId" IN (
        SELECT "id" FROM "NodeCheckpoint" WHERE "nodeId" = ${nodeId}
      )
    `);
    if (updated !== batch.length) throw new Error('Checkpoint items changed during saving. Reload before saving.');
  }
}

export async function createQuestionRows(
  tx: Prisma.TransactionClient,
  items: Array<{ checkpointId: string; data: ItemData }>
) {
  for (const batch of checkpointBatches(items.map(({ checkpointId, data }) => ({ ...data, checkpointId }))))
    await tx.checkpointQuestion.createMany({ data: batch });
}

export async function createCheckpointRows(
  tx: Prisma.TransactionClient,
  nodeId: string,
  checkpoints: CheckpointCreate[]
) {
  for (const batch of checkpointBatches(checkpoints)) {
    const created = await tx.nodeCheckpoint.createManyAndReturn({
      data: batch.map((checkpoint) => ({
        nodeId,
        sortOrder: checkpoint.sortOrder,
        checkpointKey: checkpoint.checkpointKey,
        timeOffsetSeconds: checkpoint.timeOffsetSeconds,
        placementHint: checkpoint.placementHint,
      })),
      select: { id: true, sortOrder: true },
    });
    // Prisma does not guarantee return order. Correlate by the validated unique sort order.
    const byOrder = new Map(created.map((checkpoint) => [checkpoint.sortOrder, checkpoint.id]));
    const items = batch.flatMap((checkpoint) => {
      const checkpointId = byOrder.get(checkpoint.sortOrder);
      if (!checkpointId) throw new Error('Created checkpoint identity is missing.');
      return checkpoint.questions.create.map((data) => ({ checkpointId, data }));
    });
    await createQuestionRows(tx, items);
  }
}
