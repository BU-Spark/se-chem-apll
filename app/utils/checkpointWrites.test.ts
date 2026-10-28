/** @jest-environment node */
import { Prisma } from '@prisma/client';
import {
  checkpointBatches,
  CHECKPOINT_BATCH_ROWS,
  updateCheckpointRows,
  updateQuestionRows,
  createCheckpointRows,
  createQuestionRows,
} from './checkpointWrites';

function transaction() {
  return {
    $executeRaw: jest.fn(async (sql: Prisma.Sql) => JSON.parse(sql.values[0] as string).length),
    nodeCheckpoint: {
      createManyAndReturn: jest.fn(async ({ data }: { data: Array<{ sortOrder: number }> }) =>
        [...data].reverse().map((c) => ({ id: `cp-${c.sortOrder}`, sortOrder: c.sortOrder }))
      ),
    },
    checkpointQuestion: { createMany: jest.fn() },
  };
}
const item = { sortOrder: 0, kind: 'NOTE' as const, prompt: 'Observe.', options: { type: 'note' }, correctIndices: [] };

describe('checkpoint batch writes', () => {
  it('bounds batches by row count and serialized size without losing rows', () => {
    const rows = Array.from({ length: 1001 }, (_, i) => i);
    expect([...checkpointBatches(rows)].map((b) => b.length)).toEqual([500, 500, 1]);
    const large = Array.from({ length: 3 }, (_, i) => `${i}${'文'.repeat(200000)}`);
    expect([...checkpointBatches(large)].map((b) => b.length)).toEqual([1, 1, 1]);
    expect([...checkpointBatches(large)].flat()).toEqual(large);
    expect([...checkpointBatches([])]).toEqual([]);
  });

  it('uses ten bounded update statements for 5,000 checkpoint changes', async () => {
    const tx = transaction();
    const changes = new Map(Array.from({ length: 5000 }, (_, i) => [`cp-${i}`, { timeOffsetSeconds: i }]));
    await updateCheckpointRows(tx as unknown as Prisma.TransactionClient, 'node1', changes);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(10);
    for (const [sql] of tx.$executeRaw.mock.calls) {
      expect(JSON.parse(sql.values[0] as string)).toHaveLength(CHECKPOINT_BATCH_ROWS);
      expect(sql.values[1]).toBe('node1');
    }
  });

  it('parameterizes text and distinguishes null clears from omitted fields', async () => {
    const tx = transaction();
    const hostile = "'); DROP TABLE Student; -- \\ $λ";
    await updateCheckpointRows(
      tx as unknown as Prisma.TransactionClient,
      hostile,
      new Map([
        ['cp-1', { checkpointKey: hostile, timeOffsetSeconds: null }],
        ['cp-2', { placementHint: null }],
      ])
    );
    const sql = tx.$executeRaw.mock.calls[0][0];
    expect(sql.text).not.toContain(hostile);
    expect(JSON.parse(sql.values[0] as string)).toEqual([
      {
        id: 'cp-1',
        checkpointKey: hostile,
        timeOffsetSeconds: null,
        setOrder: false,
        setKey: true,
        setTime: true,
        setHint: false,
      },
      { id: 'cp-2', placementHint: null, setOrder: false, setKey: false, setTime: false, setHint: true },
    ]);
  });

  it('separates question order changes from content changes in bulk updates', async () => {
    const tx = transaction();
    await updateQuestionRows(
      tx as unknown as Prisma.TransactionClient,
      'node1',
      new Map([
        ['q1', { sortOrder: 1 }],
        ['q2', { ...item, sortOrder: 0 }],
      ])
    );
    expect(JSON.parse(tx.$executeRaw.mock.calls[0][0].values[0] as string)).toEqual([
      { id: 'q1', sortOrder: 1, setContent: false },
      { id: 'q2', ...item, setContent: true },
    ]);
  });

  it('detects missing or out-of-scope update targets', async () => {
    const tx = transaction();
    tx.$executeRaw.mockResolvedValue(0);
    await expect(
      updateCheckpointRows(tx as unknown as Prisma.TransactionClient, 'node1', new Map([['foreign', { sortOrder: 0 }]]))
    ).rejects.toThrow(/changed during saving/);
    await expect(
      updateQuestionRows(tx as unknown as Prisma.TransactionClient, 'node1', new Map([['foreign', { sortOrder: 0 }]]))
    ).rejects.toThrow(/changed during saving/);
  });

  it('maps returned checkpoint IDs by sort order and chunks all question inserts', async () => {
    const tx = transaction();
    const checkpoints = Array.from({ length: 1001 }, (_, i) => ({
      sortOrder: i,
      checkpointKey: `key-${i}`,
      timeOffsetSeconds: null,
      placementHint: null,
      questions: { create: [{ ...item, prompt: `Item ${i}` }] },
    }));
    await createCheckpointRows(tx as unknown as Prisma.TransactionClient, 'node1', checkpoints);
    expect(tx.nodeCheckpoint.createManyAndReturn).toHaveBeenCalledTimes(3);
    expect(tx.checkpointQuestion.createMany).toHaveBeenCalledTimes(3);
    const items = tx.checkpointQuestion.createMany.mock.calls.flatMap(([args]) => args.data);
    expect(items).toEqual(checkpoints.map((_, i) => ({ ...item, prompt: `Item ${i}`, checkpointId: `cp-${i}` })));
  });

  it('chunks questions even when they all belong to one existing checkpoint', async () => {
    const tx = transaction();
    await createQuestionRows(
      tx as unknown as Prisma.TransactionClient,
      Array.from({ length: 1001 }, (_, i) => ({ checkpointId: 'cp1', data: { ...item, sortOrder: i } }))
    );
    expect(tx.checkpointQuestion.createMany.mock.calls.map(([args]) => args.data.length)).toEqual([500, 500, 1]);
  });

  it('does not issue empty batches', async () => {
    const tx = transaction();
    const client = tx as unknown as Prisma.TransactionClient;
    await updateCheckpointRows(client, 'node1', new Map());
    await updateQuestionRows(client, 'node1', new Map());
    await createCheckpointRows(client, 'node1', []);
    await createQuestionRows(client, []);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.nodeCheckpoint.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.createMany).not.toHaveBeenCalled();
  });
});
