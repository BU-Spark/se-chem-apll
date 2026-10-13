import type { Prisma } from '@prisma/client';
import { serializeCheckpointCreate, questionContentKey, type CheckpointPayload } from './nodeContent';

import {
  checkpointBatches,
  updateCheckpointRows,
  updateQuestionRows,
  createCheckpointRows,
  createQuestionRows,
  type CheckpointMetadata,
  type ItemData,
} from './checkpointWrites';

export class CheckpointSaveConflict extends Error {}

/** Reconcile explicit database IDs only. CSV keys never implicitly overwrite content. */
export async function saveCheckpoints(tx: Prisma.TransactionClient, nodeId: string, checkpoints: CheckpointPayload[]) {
  const existing = await tx.nodeCheckpoint.findMany({ where: { nodeId }, include: { questions: true } });
  const byId = new Map(existing.map((checkpoint) => [checkpoint.id, checkpoint]));
  const itemsByCheckpoint = new Map(
    existing.map((checkpoint) => [checkpoint.id, new Map(checkpoint.questions.map((item) => [item.id, item]))])
  );
  const retained = new Set(checkpoints.flatMap((c) => (c.id ? [c.id] : [])));
  const retainedItems = new Set(checkpoints.flatMap((c) => (c.questions ?? []).flatMap((q) => (q.id ? [q.id] : []))));
  const removedCheckpoints = existing.filter((c) => !retained.has(c.id)).map((c) => c.id);
  const affectedItems = new Set<string>();
  const checkpointCreates: ReturnType<typeof serializeCheckpointCreate>[] = [];
  const checkpointUpdates = new Map<string, Partial<CheckpointMetadata>>();
  const itemCreates: Array<{ checkpointId: string; data: ItemData }> = [];
  const itemUpdates = new Map<string, ItemData | { sortOrder: number }>();
  const itemDeletes = new Map<string, string[]>();

  // Build the complete change plan, including ID validation, before any writes.
  const incoming = checkpoints.map((checkpoint) => {
    const prior = checkpoint.id ? byId.get(checkpoint.id) : undefined;
    if (checkpoint.id && !prior)
      throw new CheckpointSaveConflict('A checkpoint no longer exists in this node. Reload before saving.');
    const serialized = serializeCheckpointCreate(checkpoint);
    const { questions, ...metadata } = serialized;
    if (!prior) checkpointCreates.push(serialized);
    else {
      const changed: Partial<CheckpointMetadata> = {};
      if (prior.sortOrder !== metadata.sortOrder) changed.sortOrder = metadata.sortOrder;
      if (prior.checkpointKey !== metadata.checkpointKey) changed.checkpointKey = metadata.checkpointKey;
      if (prior.timeOffsetSeconds !== metadata.timeOffsetSeconds)
        changed.timeOffsetSeconds = metadata.timeOffsetSeconds;
      if (prior.placementHint !== metadata.placementHint) changed.placementHint = metadata.placementHint;
      if (Object.keys(changed).length) checkpointUpdates.set(prior.id, changed);
    }
    for (const [index, item] of (checkpoint.questions ?? []).entries()) {
      const old = item.id && prior ? itemsByCheckpoint.get(prior.id)?.get(item.id) : undefined;
      if (item.id && !old)
        throw new CheckpointSaveConflict('An item does not belong to this checkpoint. Reload before saving.');
      if (old) {
        if (questionContentKey(old) !== questionContentKey(item)) {
          affectedItems.add(old.id);
          itemUpdates.set(old.id, questions.create[index]);
        } else if (old.sortOrder !== item.sortOrder) {
          // Reordering must not rewrite the content of answered questions.
          itemUpdates.set(old.id, { sortOrder: item.sortOrder });
        }
      } else if (prior) itemCreates.push({ checkpointId: prior.id, data: questions.create[index] });
    }
    return { id: checkpoint.id, metadata, items: checkpoint.questions ?? [] };
  });

  for (const checkpoint of existing) {
    const removed = checkpoint.questions.filter((item) => !retained.has(checkpoint.id) || !retainedItems.has(item.id));
    for (const item of removed) affectedItems.add(item.id);
    // Deleted checkpoints cascade to their items; only retained checkpoints need item deletes.
    if (retained.has(checkpoint.id) && removed.length)
      itemDeletes.set(
        checkpoint.id,
        removed.map((item) => item.id)
      );
  }
  for (const ids of checkpointBatches(affectedItems)) {
    if (await tx.nodeResponse.count({ where: { checkpointQuestionId: { in: ids } } })) {
      throw new CheckpointSaveConflict(
        'These checkpoint items have student responses. Their content cannot be replaced or removed. Create a new node for revised content; timing and ordering can still be edited.'
      );
    }
  }
  if (
    !checkpointCreates.length &&
    !checkpointUpdates.size &&
    !removedCheckpoints.length &&
    !itemCreates.length &&
    !itemUpdates.size &&
    !itemDeletes.size
  )
    return;

  // Only stage retained rows whose current unique values block another incoming row.
  // Removed rows are deleted first, so they do not need temporary values.
  const kept = existing.filter((checkpoint) => retained.has(checkpoint.id));
  const orderOwners = new Map(kept.map((c) => [c.sortOrder, c.id]));
  const keyOwners = new Map(kept.map((c) => [c.checkpointKey, c.id]));
  const timeOwners = new Map(kept.filter((c) => c.timeOffsetSeconds !== null).map((c) => [c.timeOffsetSeconds, c.id]));
  const temporaryOrders = new Map(existing.map((c, index) => [c.id, -index - 1]));
  const releases = new Map<string, Partial<CheckpointMetadata>>();
  const itemReleases = new Map<string, number>();
  const keys = new Set([...existing.map((c) => c.checkpointKey), ...incoming.map((c) => c.metadata.checkpointKey)]);
  let temporaryPrefix = '__saving-';
  while (kept.some((c) => keys.has(`${temporaryPrefix}${c.id}`))) temporaryPrefix = `_${temporaryPrefix}`;

  for (const checkpoint of incoming) {
    const { metadata } = checkpoint;
    const orderOwner = orderOwners.get(metadata.sortOrder);
    if (orderOwner && orderOwner !== checkpoint.id)
      releases.set(orderOwner, { ...releases.get(orderOwner), sortOrder: temporaryOrders.get(orderOwner)! });
    const keyOwner = keyOwners.get(metadata.checkpointKey);
    if (keyOwner && keyOwner !== checkpoint.id)
      releases.set(keyOwner, { ...releases.get(keyOwner), checkpointKey: `${temporaryPrefix}${keyOwner}` });
    const timeOwner = metadata.timeOffsetSeconds === null ? undefined : timeOwners.get(metadata.timeOffsetSeconds);
    if (timeOwner && timeOwner !== checkpoint.id)
      releases.set(timeOwner, { ...releases.get(timeOwner), timeOffsetSeconds: null });

    const prior = checkpoint.id ? byId.get(checkpoint.id) : undefined;
    if (!prior) continue;
    const itemOrderOwners = new Map(
      prior.questions.flatMap((item, index) =>
        retainedItems.has(item.id) ? [[item.sortOrder, { id: item.id, temporaryOrder: -index - 1 }] as const] : []
      )
    );
    for (const item of checkpoint.items) {
      const owner = itemOrderOwners.get(item.sortOrder);
      if (owner && owner.id !== item.id) itemReleases.set(owner.id, owner.temporaryOrder);
    }
  }

  for (const ids of checkpointBatches(removedCheckpoints))
    await tx.nodeCheckpoint.deleteMany({ where: { nodeId, id: { in: ids } } });
  for (const ids of checkpointBatches([...itemDeletes.values()].flat()))
    await tx.checkpointQuestion.deleteMany({ where: { checkpoint: { nodeId }, id: { in: ids } } });

  // Complete all releases across all batches before applying final unique values.
  await updateCheckpointRows(tx, nodeId, releases);
  await updateQuestionRows(tx, nodeId, new Map([...itemReleases].map(([id, sortOrder]) => [id, { sortOrder }])));
  await updateCheckpointRows(tx, nodeId, checkpointUpdates);
  await createCheckpointRows(tx, nodeId, checkpointCreates);
  await updateQuestionRows(tx, nodeId, itemUpdates);
  await createQuestionRows(tx, itemCreates);
}
