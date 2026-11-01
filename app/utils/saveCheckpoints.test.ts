import type { Prisma } from '@prisma/client';
import { saveCheckpoints } from './saveCheckpoints';

// Inspect the reconciliation plan independently of the bulk transport.
// checkpointWrites tests and the PostgreSQL suite exercise actual batch execution.
jest.mock('./checkpointWrites', () => ({
  ...jest.requireActual('./checkpointWrites'),
  updateCheckpointRows: async (tx: Prisma.TransactionClient, _nodeId: string, rows: Map<string, object>) => {
    for (const [id, data] of rows) await tx.nodeCheckpoint.update({ where: { id }, data });
  },
  updateQuestionRows: async (tx: Prisma.TransactionClient, _nodeId: string, rows: Map<string, object>) => {
    for (const [id, data] of rows) await tx.checkpointQuestion.update({ where: { id }, data });
  },
  createCheckpointRows: async (
    tx: Prisma.TransactionClient,
    nodeId: string,
    rows: Array<Prisma.NodeCheckpointCreateWithoutNodeInput>
  ) => {
    for (const data of rows) await tx.nodeCheckpoint.create({ data: { ...data, nodeId } });
  },
  createQuestionRows: async (
    tx: Prisma.TransactionClient,
    rows: Array<{ checkpointId: string; data: Prisma.CheckpointQuestionCreateWithoutCheckpointInput }>
  ) => {
    for (const { checkpointId, data } of rows) await tx.checkpointQuestion.create({ data: { ...data, checkpointId } });
  },
}));

const question = {
  id: 'q1',
  sortOrder: 0,
  prompt: 'Observe.',
  kind: 'NOTE',
  options: { type: 'note' },
  correctIndices: [],
};
const checkpoint = {
  id: 'cp1',
  checkpointKey: 'intro',
  sortOrder: 0,
  placementHint: null,
  timeOffsetSeconds: 10,
  questions: [question],
};
function transaction() {
  return {
    nodeCheckpoint: {
      findMany: jest.fn().mockResolvedValue([checkpoint]),
      update: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    checkpointQuestion: { update: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    nodeResponse: { count: jest.fn().mockResolvedValue(1) },
  };
}

describe('checkpoint persistence', () => {
  it('does no writes or response lookups for an unchanged collection', async () => {
    const tx = transaction();
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [checkpoint]);
    expect(tx.nodeCheckpoint.findMany).toHaveBeenCalledTimes(1);
    expectNoWrites(tx);
    expect(tx.nodeResponse.count).not.toHaveBeenCalled();
  });

  it('does no writes for empty collections', async () => {
    const tx = transaction();
    tx.nodeCheckpoint.findMany.mockResolvedValue([]);
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', []);
    expectNoWrites(tx);
  });

  it('changes timing in place without deleting responses or recreating items', async () => {
    const tx = transaction();
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      { ...checkpoint, timeOffsetSeconds: 90 },
    ]);
    expect(tx.nodeResponse.count).not.toHaveBeenCalled();
    expect(tx.nodeCheckpoint.create).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.create).not.toHaveBeenCalled();
    expect(tx.nodeCheckpoint.update).toHaveBeenCalledTimes(1);
    expect(tx.nodeCheckpoint.update).toHaveBeenCalledWith({
      where: { id: 'cp1' },
      data: { timeOffsetSeconds: 90 },
    });
    expect(tx.nodeCheckpoint.deleteMany).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.deleteMany).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.update).not.toHaveBeenCalled();
  });
  it.each(['remove', 'edit', 'csv replacement'])(
    'blocks %s of items with responses before writes',
    async (operation) => {
      const tx = transaction();
      const incoming =
        operation === 'remove'
          ? []
          : operation === 'edit'
            ? [{ ...checkpoint, questions: [{ ...question, prompt: 'Changed' }] }]
            : [{ ...checkpoint, id: undefined, questions: [{ ...question, id: undefined }] }];
      await expect(saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', incoming)).rejects.toThrow(
        /student responses/
      );
      expect(tx.nodeCheckpoint.update).not.toHaveBeenCalled();
      expect(tx.nodeCheckpoint.deleteMany).not.toHaveBeenCalled();
    }
  );
  it('does not treat matching CSV keys as database IDs', async () => {
    const tx = transaction();
    tx.nodeResponse.count.mockResolvedValue(0);
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      { ...checkpoint, id: undefined, questions: [{ ...question, id: undefined }] },
    ]);
    expect(tx.nodeCheckpoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ nodeId: 'node1', checkpointKey: 'intro' }),
    });
  });
  it.each([[{ ...checkpoint, id: 'foreign' }], [{ ...checkpoint, questions: [{ ...question, id: 'foreign' }] }]])(
    'rejects IDs outside the node/checkpoint',
    async (incoming) => {
      const tx = transaction();
      await expect(saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [incoming])).rejects.toThrow(
        /Reload/
      );
      expect(tx.nodeCheckpoint.update).not.toHaveBeenCalled();
    }
  );
});

function expectNoWrites(tx: ReturnType<typeof transaction>) {
  for (const model of [tx.nodeCheckpoint, tx.checkpointQuestion]) {
    expect(model.update).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
    expect(model.deleteMany).not.toHaveBeenCalled();
  }
}

const secondQuestion = { ...question, id: 'q2', sortOrder: 1, prompt: 'Another note.' };
const secondCheckpoint = {
  ...checkpoint,
  id: 'cp2',
  checkpointKey: 'next',
  sortOrder: 1,
  timeOffsetSeconds: 20,
  questions: [{ ...question, id: 'q3' }],
};

describe('checkpoint change detection', () => {
  it.each([false, true])('skips unrelated writes across 5,000 groups (one edit: %s)', async (edit) => {
    const tx = transaction();
    const existing = Array.from({ length: 5000 }, (_, i) => ({
      ...checkpoint,
      id: `cp-${i}`,
      checkpointKey: `key-${i}`,
      sortOrder: i,
      timeOffsetSeconds: i,
      questions: [{ ...question, id: `q-${i}` }],
    }));
    tx.nodeCheckpoint.findMany.mockResolvedValue(existing);
    const incoming = existing.map((c, i) => (edit && i === 2500 ? { ...c, timeOffsetSeconds: 6000 } : c));
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', incoming);
    if (edit) {
      expect(tx.nodeCheckpoint.update).toHaveBeenCalledTimes(1);
      expect(tx.nodeCheckpoint.update).toHaveBeenCalledWith({
        where: { id: 'cp-2500' },
        data: { timeOffsetSeconds: 6000 },
      });
    } else expectNoWrites(tx);
    expect(tx.nodeResponse.count).not.toHaveBeenCalled();
    expect(tx.nodeCheckpoint.deleteMany).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.update).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.create).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.deleteMany).not.toHaveBeenCalled();
  });

  it('compares normalized metadata and semantically equivalent question content', async () => {
    const tx = transaction();
    const mc = { ...question, kind: 'QUESTION', options: ['A', 'B'], correctIndices: [0, 1] };
    const old = { ...checkpoint, placementHint: 'After intro', questions: [mc] };
    tx.nodeCheckpoint.findMany.mockResolvedValue([old]);
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      {
        ...old,
        checkpointKey: ' intro ',
        placementHint: ' After intro ',
        questions: [
          { ...mc, kind: 'question', options: { choices: ['A', 'B'], type: 'multipleChoice' }, correctIndices: [1, 0] },
        ],
      },
    ]);
    expectNoWrites(tx);
    expect(tx.nodeResponse.count).not.toHaveBeenCalled();
  });

  it('updates only a changed placement hint', async () => {
    const tx = transaction();
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      { ...checkpoint, placementHint: ' After intro ' },
    ]);
    expect(tx.nodeCheckpoint.update.mock.calls).toEqual([
      [{ where: { id: 'cp1' }, data: { placementHint: 'After intro' } }],
    ]);
    expect(tx.checkpointQuestion.update).not.toHaveBeenCalled();
    expect(tx.nodeResponse.count).not.toHaveBeenCalled();
  });

  it('updates only changed question content after checking responses', async () => {
    const tx = transaction();
    tx.nodeResponse.count.mockResolvedValue(0);
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      { ...checkpoint, questions: [{ ...question, prompt: 'Changed note.' }] },
    ]);
    expect(tx.nodeResponse.count).toHaveBeenCalledWith({ where: { checkpointQuestionId: { in: ['q1'] } } });
    expect(tx.checkpointQuestion.update.mock.calls).toEqual([
      [
        {
          where: { id: 'q1' },
          data: {
            sortOrder: 0,
            kind: 'NOTE',
            prompt: 'Changed note.',
            options: { type: 'note' },
            correctIndices: [],
          },
        },
      ],
    ]);
    expect(tx.nodeCheckpoint.update).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.deleteMany).not.toHaveBeenCalled();
  });

  it('appends checkpoints and items without rewriting existing content', async () => {
    const tx = transaction();
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      { ...checkpoint, questions: [question, { ...secondQuestion, id: undefined }] },
      { ...secondCheckpoint, id: undefined, questions: [{ ...question, id: undefined }] },
    ]);
    expect(tx.nodeCheckpoint.create).toHaveBeenCalledTimes(1);
    expect(tx.checkpointQuestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ checkpointId: 'cp1', sortOrder: 1 }),
    });
    expect(tx.nodeCheckpoint.update).not.toHaveBeenCalled();
    expect(tx.nodeCheckpoint.deleteMany).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.update).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.deleteMany).not.toHaveBeenCalled();
    expect(tx.nodeResponse.count).not.toHaveBeenCalled();
  });

  it('deletes only removed checkpoints and removed items of retained checkpoints', async () => {
    const tx = transaction();
    tx.nodeResponse.count.mockResolvedValue(0);
    tx.nodeCheckpoint.findMany.mockResolvedValue([
      { ...checkpoint, questions: [question, secondQuestion] },
      secondCheckpoint,
    ]);
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      { ...checkpoint, questions: [question] },
    ]);
    expect(tx.nodeResponse.count).toHaveBeenCalledWith({ where: { checkpointQuestionId: { in: ['q2', 'q3'] } } });
    expect(tx.nodeCheckpoint.deleteMany.mock.calls).toEqual([[{ where: { nodeId: 'node1', id: { in: ['cp2'] } } }]]);
    expect(tx.checkpointQuestion.deleteMany.mock.calls).toEqual([
      [{ where: { checkpoint: { nodeId: 'node1' }, id: { in: ['q2'] } } }],
    ]);
    expect(tx.nodeCheckpoint.update).not.toHaveBeenCalled();
    expect(tx.checkpointQuestion.update).not.toHaveBeenCalled();
  });

  it('deletes a removed owner before reusing its timestamp without staging surviving rows', async () => {
    const tx = transaction();
    tx.nodeResponse.count.mockResolvedValue(0);
    tx.nodeCheckpoint.findMany.mockResolvedValue([checkpoint, secondCheckpoint]);
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      { ...checkpoint, timeOffsetSeconds: 20 },
    ]);
    expect(tx.nodeCheckpoint.update.mock.calls).toEqual([[{ where: { id: 'cp1' }, data: { timeOffsetSeconds: 20 } }]]);
    expect(tx.nodeCheckpoint.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.nodeCheckpoint.update.mock.invocationCallOrder[0]
    );
  });

  it.each(['sortOrder', 'checkpointKey', 'timeOffsetSeconds'] as const)(
    'stages only the conflicting %s values for a swap',
    async (field) => {
      const tx = transaction();
      const unchanged = {
        ...checkpoint,
        id: 'cp3',
        checkpointKey: 'untouched',
        sortOrder: 2,
        timeOffsetSeconds: 30,
        questions: [{ ...question, id: 'q4' }],
      };
      tx.nodeCheckpoint.findMany.mockResolvedValue([checkpoint, secondCheckpoint, unchanged]);
      await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
        { ...checkpoint, [field]: secondCheckpoint[field] },
        { ...secondCheckpoint, [field]: checkpoint[field] },
        unchanged,
      ]);
      const temporary =
        field === 'timeOffsetSeconds'
          ? [null, null]
          : field === 'sortOrder'
            ? [-2, -1]
            : ['__saving-cp2', '__saving-cp1'];
      expect(tx.nodeCheckpoint.update.mock.calls).toEqual([
        [{ where: { id: 'cp2' }, data: { [field]: temporary[0] } }],
        [{ where: { id: 'cp1' }, data: { [field]: temporary[1] } }],
        [{ where: { id: 'cp1' }, data: { [field]: secondCheckpoint[field] } }],
        [{ where: { id: 'cp2' }, data: { [field]: checkpoint[field] } }],
      ]);
      expect(tx.checkpointQuestion.update).not.toHaveBeenCalled();
      expect(tx.nodeResponse.count).not.toHaveBeenCalled();
    }
  );

  it('avoids normalized incoming keys when choosing temporary keys', async () => {
    const tx = transaction();
    tx.nodeCheckpoint.findMany.mockResolvedValue([checkpoint, secondCheckpoint]);
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      { ...checkpoint, checkpointKey: 'next' },
      { ...secondCheckpoint, checkpointKey: 'intro' },
      {
        ...secondCheckpoint,
        id: undefined,
        sortOrder: 2,
        timeOffsetSeconds: null,
        checkpointKey: ' __saving-cp2 ',
        questions: [],
      },
    ]);
    expect(tx.nodeCheckpoint.update.mock.calls[0][0].data).toEqual({ checkpointKey: '___saving-cp2' });
    expect(tx.nodeCheckpoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ checkpointKey: '__saving-cp2' }),
    });
  });

  it('stages question order swaps without rewriting answered content', async () => {
    const tx = transaction();
    tx.nodeCheckpoint.findMany.mockResolvedValue([{ ...checkpoint, questions: [question, secondQuestion] }]);
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      {
        ...checkpoint,
        questions: [
          { ...secondQuestion, sortOrder: 0 },
          { ...question, sortOrder: 1 },
        ],
      },
    ]);
    expect(tx.checkpointQuestion.update.mock.calls).toEqual([
      [{ where: { id: 'q1' }, data: { sortOrder: -1 } }],
      [{ where: { id: 'q2' }, data: { sortOrder: -2 } }],
      [{ where: { id: 'q2' }, data: { sortOrder: 0 } }],
      [{ where: { id: 'q1' }, data: { sortOrder: 1 } }],
    ]);
    expect(tx.nodeCheckpoint.update).not.toHaveBeenCalled();
    expect(tx.nodeResponse.count).not.toHaveBeenCalled();
  });

  it('releases an occupied question order before inserting at that position', async () => {
    const tx = transaction();
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      {
        ...checkpoint,
        questions: [
          { ...question, id: undefined, prompt: 'Inserted' },
          { ...question, sortOrder: 1 },
        ],
      },
    ]);
    expect(tx.checkpointQuestion.update.mock.calls).toEqual([
      [{ where: { id: 'q1' }, data: { sortOrder: -1 } }],
      [{ where: { id: 'q1' }, data: { sortOrder: 1 } }],
    ]);
    expect(tx.checkpointQuestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ checkpointId: 'cp1', sortOrder: 0, prompt: 'Inserted' }),
    });
    expect(tx.checkpointQuestion.update.mock.invocationCallOrder[1]).toBeLessThan(
      tx.checkpointQuestion.create.mock.invocationCallOrder[0]
    );
    expect(tx.nodeCheckpoint.update).not.toHaveBeenCalled();
    expect(tx.nodeResponse.count).not.toHaveBeenCalled();
  });

  it('reuses a deleted item order without staging or rewriting its siblings', async () => {
    const tx = transaction();
    tx.nodeResponse.count.mockResolvedValue(0);
    tx.nodeCheckpoint.findMany.mockResolvedValue([{ ...checkpoint, questions: [question, secondQuestion] }]);
    await saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
      { ...checkpoint, questions: [{ ...question, id: undefined, prompt: 'Replacement' }, secondQuestion] },
    ]);
    expect(tx.checkpointQuestion.deleteMany).toHaveBeenCalledWith({
      where: { checkpoint: { nodeId: 'node1' }, id: { in: ['q1'] } },
    });
    expect(tx.checkpointQuestion.create).toHaveBeenCalledTimes(1);
    expect(tx.checkpointQuestion.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.checkpointQuestion.create.mock.invocationCallOrder[0]
    );
    expect(tx.checkpointQuestion.update).not.toHaveBeenCalled();
    expect(tx.nodeCheckpoint.update).not.toHaveBeenCalled();
    expect(tx.nodeResponse.count).toHaveBeenCalledWith({ where: { checkpointQuestionId: { in: ['q1'] } } });
  });

  it('rejects an item moved from another checkpoint before any writes', async () => {
    const tx = transaction();
    tx.nodeCheckpoint.findMany.mockResolvedValue([checkpoint, secondCheckpoint]);
    await expect(
      saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
        { ...checkpoint, questions: secondCheckpoint.questions },
        { ...secondCheckpoint, questions: [] },
      ])
    ).rejects.toThrow(/does not belong/);
    expectNoWrites(tx);
  });

  it('blocks mixed edits before unrelated writes when any affected item has responses', async () => {
    const tx = transaction();
    tx.nodeCheckpoint.findMany.mockResolvedValue([checkpoint, secondCheckpoint]);
    await expect(
      saveCheckpoints(tx as unknown as Prisma.TransactionClient, 'node1', [
        { ...checkpoint, timeOffsetSeconds: 50, questions: [{ ...question, prompt: 'Changed' }] },
      ])
    ).rejects.toThrow(/student responses/);
    expectNoWrites(tx);
  });
});
