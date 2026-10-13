/** @jest-environment node */
import { PrismaClient, type Prisma } from '@prisma/client';
import { saveCheckpoints } from './saveCheckpoints';
import { nodeInclude, type CheckpointPayload } from './nodeContent';
import { updateCheckpointRows, updateQuestionRows } from './checkpointWrites';

// Explicit opt-in: never use the application's DATABASE_URL for destructive fixtures.
const databaseUrl = process.env.CHECKPOINT_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.startsWith('/spark_checkpoint_test'))
    throw new Error('Checkpoint integration tests require a dedicated local spark_checkpoint_test database.');
}
const createClient = () =>
  new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [{ emit: 'event', level: 'query' }] });
const databaseTests = databaseUrl ? describe : describe.skip;
jest.setTimeout(60000);

databaseTests('checkpoint persistence in PostgreSQL', () => {
  let prisma: ReturnType<typeof createClient>;
  const nodeIds: string[] = [];
  const lessonIds: string[] = [];
  const userIds: string[] = [];
  let sqlCount = 0;
  beforeAll(() => {
    prisma = createClient();
    prisma.$on('query', () => {
      sqlCount++;
    });
  });
  afterAll(async () => {
    try {
      await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
      await prisma.node.deleteMany({ where: { id: { in: nodeIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });
  async function newNode() {
    const node = await prisma.node.create({ data: { title: 'Checkpoint integration fixture', isDraft: true } });
    nodeIds.push(node.id);
    return node.id;
  }
  function payload(count: number): CheckpointPayload[] {
    return Array.from({ length: count }, (_, i) => ({
      sortOrder: i,
      checkpointKey: `key-${i}`,
      timeOffsetSeconds: i,
      placementHint: `Hint ${i}`,
      questions: [{ sortOrder: 0, kind: 'NOTE', prompt: `Item ${i}`, options: { type: 'note' }, correctIndices: [] }],
    }));
  }
  async function load(nodeId: string) {
    return prisma.node.findUniqueOrThrow({ where: { id: nodeId }, include: nodeInclude });
  }
  async function save(nodeId: string, checkpoints: CheckpointPayload[], latency = 0) {
    const before = sqlCount;
    const start = performance.now();
    let calls = 0;
    // Simulate latency per Prisma operation, including raw SQL and final node readback.
    // This is deliberately separate from the actual emitted SQL statement count.
    function delayed<T extends object>(target: T): T {
      return new Proxy(target, {
        get(object, property) {
          const value = Reflect.get(object, property);
          if (typeof value === 'function')
            return async (...args: unknown[]) => {
              calls++;
              if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
              return Reflect.apply(value, object, args);
            };
          return value && typeof value === 'object' ? delayed(value) : value;
        },
      });
    }
    const result = await prisma.$transaction(async (realTx) => {
      const tx = delayed(realTx);
      await tx.$executeRaw`SET LOCAL TIME ZONE 'America/New_York'`;
      await saveCheckpoints(tx, nodeId, checkpoints);
      return tx.node.update({
        where: { id: nodeId },
        data: { title: 'Saved integration fixture' },
        include: nodeInclude,
      });
    }); // Keep Prisma's default five-second transaction timeout.
    return { result, elapsedMs: Math.round(performance.now() - start), calls, sqlStatements: sqlCount - before };
  }

  it('persists nullable metadata, enum kinds, JSON answers, and quoted text without rewriting other fields', async () => {
    const nodeId = await newNode();
    const initial = payload(3);
    initial[0].questions!.push({ ...initial[0].questions![0], sortOrder: 1, prompt: 'Second note' });
    const { result: created } = await save(nodeId, initial);
    const incoming = created.checkpoints.map((c) => ({ ...c }));
    incoming[0].placementHint = null;
    incoming[1].timeOffsetSeconds = null;
    incoming[2].checkpointKey = "quotes '); DROP TABLE Student; -- λ";
    incoming[0].questions = [
      {
        ...incoming[0].questions[0],
        kind: 'QUESTION',
        prompt: "Which 'quoted' \\ answer?",
        options: { type: 'multipleChoice', choices: ['α', 'B', 'C'] },
        correctIndices: [0, 2],
      },
      {
        ...incoming[0].questions[1],
        kind: 'QUESTION',
        options: { type: 'shortAnswer', answerMode: 'range', minimumAnswer: -1.5, maximumAnswer: 2.75 },
      },
    ];
    const { result } = await save(nodeId, incoming);
    expect(result.checkpoints.map((c) => c.id)).toEqual(created.checkpoints.map((c) => c.id));
    expect(result.checkpoints[0].placementHint).toBeNull();
    expect(result.checkpoints[0].timeOffsetSeconds).toBe(0);
    expect(result.checkpoints[1].timeOffsetSeconds).toBeNull();
    expect(result.checkpoints[1].placementHint).toBe('Hint 1');
    expect(result.checkpoints[2].checkpointKey).toBe(incoming[2].checkpointKey);
    const { id, kind, prompt, options, correctIndices } = incoming[0].questions[0];
    expect(result.checkpoints[0].questions[0]).toMatchObject({ id, kind, prompt, options, correctIndices });
    expect(result.checkpoints[0].questions[0].updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.checkpoints[0].questions[0].updatedAt.getTime()
    );
    expect(result.checkpoints[0].questions[1].options).toEqual(incoming[0].questions[1].options);
    expect(result.checkpoints[2].questions[0].updatedAt).toEqual(created.checkpoints[2].questions[0].updatedAt);
    expect(result.checkpoints[0].updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.checkpoints[0].updatedAt.getTime()
    );
  });

  it('preserves responses during swaps and rejects content edits, removal, and replacement', async () => {
    const nodeId = await newNode();
    const initial = payload(2);
    initial[0].questions!.push({ ...initial[0].questions![0], sortOrder: 1, prompt: 'Second note' });
    const { result: created } = await save(nodeId, initial);
    const user = await prisma.user.create({ data: { email: `${nodeId}@checkpoint.test` } });
    userIds.push(user.id);
    const lesson = await prisma.lesson.create({ data: { title: 'Test', summary: 'Test' } });
    lessonIds.push(lesson.id);
    const lessonNode = await prisma.lessonNode.create({
      data: { lessonId: lesson.id, nodeId, sortOrder: 0, passingPercent: 80, quizQuestionCount: 1 },
    });
    const attempt = await prisma.nodeAttempt.create({ data: { lessonNodeId: lessonNode.id, userId: user.id } });
    const response = await prisma.nodeResponse.create({
      data: { attemptId: attempt.id, studentId: user.id, checkpointQuestionId: created.checkpoints[0].questions[0].id },
    });
    const swapped = created.checkpoints.map((c, i) => ({
      ...c,
      sortOrder: 1 - i,
      checkpointKey: `key-${1 - i}`,
      timeOffsetSeconds: 1 - i,
      questions: [...c.questions].reverse().map((q, sortOrder) => ({ ...q, sortOrder })),
    }));
    const { result } = await save(nodeId, swapped);
    expect(result.checkpoints.map((c) => c.id)).toEqual([...created.checkpoints].reverse().map((c) => c.id));
    expect(await prisma.nodeResponse.findUnique({ where: { id: response.id } })).toEqual(response);
    for (const operation of ['edit', 'remove', 'replace']) {
      const incoming =
        operation === 'remove'
          ? []
          : operation === 'replace'
            ? initial
            : result.checkpoints.map((c) => ({
                ...c,
                questions: c.questions.map((q) =>
                  q.id === response.checkpointQuestionId ? { ...q, prompt: 'Changed' } : q
                ),
              }));
      await expect(save(nodeId, incoming)).rejects.toThrow(/student responses/);
      expect(await load(nodeId)).toEqual(result);
    }
  });

  it('rolls back temporary values and node metadata when a later batch fails', async () => {
    const nodeId = await newNode();
    const { result: before } = await save(nodeId, payload(1001));
    const incoming = before.checkpoints.map((c, i) => ({ ...c, sortOrder: 1000 - i, timeOffsetSeconds: 1000 - i }));
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.node.update({ where: { id: nodeId }, data: { title: 'Must roll back' } });
        let batches = 0;
        const failing = new Proxy(tx, {
          get(target, prop) {
            if (prop === '$executeRaw')
              return async (sql: Prisma.Sql) => {
                if (++batches === 2) throw new Error('Injected batch failure');
                return target.$executeRaw(sql);
              };
            return Reflect.get(target, prop);
          },
        });
        await saveCheckpoints(failing, nodeId, incoming);
      })
    ).rejects.toThrow('Injected batch failure');
    expect(await load(nodeId)).toEqual(before);
  });

  it('scopes bulk updates to the target node', async () => {
    const firstId = await newNode();
    const secondId = await newNode();
    const { result: other } = await save(secondId, payload(1));
    await expect(
      prisma.$transaction((tx) =>
        updateCheckpointRows(tx, firstId, new Map([[other.checkpoints[0].id, { sortOrder: 5 }]]))
      )
    ).rejects.toThrow(/changed during saving/);
    await expect(
      prisma.$transaction((tx) =>
        updateQuestionRows(tx, firstId, new Map([[other.checkpoints[0].questions[0].id, { sortOrder: 5 }]]))
      )
    ).rejects.toThrow(/changed during saving/);
    expect(await load(secondId)).toEqual(other);
  });

  it('reuses deleted unique values and supports several unplaced groups', async () => {
    const nodeId = await newNode();
    const { result: before } = await save(nodeId, payload(2));
    const added = payload(2).map((c, i) => ({
      ...c,
      sortOrder: i + 1,
      checkpointKey: `new-${i}`,
      timeOffsetSeconds: null,
    }));
    const { result } = await save(nodeId, [{ ...before.checkpoints[0], timeOffsetSeconds: 1 }, ...added]);
    expect(result.checkpoints).toHaveLength(3);
    expect(result.checkpoints[0].id).toBe(before.checkpoints[0].id);
    expect(result.checkpoints.map((c) => c.timeOffsetSeconds)).toEqual([1, null, null]);
    expect(
      await prisma.checkpointQuestion.findUnique({ where: { id: before.checkpoints[1].questions[0].id } })
    ).toBeNull();
  });

  it('reorders and removes 5,000 items within one retained checkpoint in bounded batches', async () => {
    const nodeId = await newNode();
    const initial = payload(1);
    initial[0].questions = Array.from({ length: 5000 }, (_, sortOrder) => ({
      sortOrder,
      kind: 'note',
      prompt: `Item ${sortOrder}`,
      options: { type: 'note' },
      correctIndices: [],
    }));
    const { result: created } = await save(nodeId, initial, 1);
    const checkpoint = created.checkpoints[0];
    const reversed = {
      ...checkpoint,
      questions: [...checkpoint.questions].reverse().map((q, sortOrder) => ({ ...q, sortOrder })),
    };
    const reordered = await save(nodeId, [reversed], 1);
    expect(reordered.sqlStatements).toBeLessThan(100);
    expect(reordered.elapsedMs).toBeLessThan(5000);
    expect(reordered.result.checkpoints[0].questions.map((q) => q.id)).toEqual(
      [...checkpoint.questions].reverse().map((q) => q.id)
    );
    const retained = reordered.result.checkpoints[0].questions[4999];
    const removed = await save(nodeId, [{ ...checkpoint, questions: [{ ...retained, sortOrder: 0 }] }], 1);
    expect(removed.sqlStatements).toBeLessThan(100);
    expect(removed.elapsedMs).toBeLessThan(5000);
    expect(removed.result.checkpoints[0].questions).toHaveLength(1);
    expect(removed.result.checkpoints[0].questions[0].id).toBe(retained.id);
  });

  it('saves 5,000 groups within the default timeout with simulated latency', async () => {
    const nodeId = await newNode();
    const initial = payload(5000);
    const timings: Array<object> = [];
    async function measure(label: string, incoming: CheckpointPayload[]) {
      const { result, ...metrics } = await save(nodeId, incoming, 1);
      timings.push({ label, ...metrics });
      expect(metrics.sqlStatements).toBeLessThan(100);
      expect(metrics.elapsedMs).toBeLessThan(5000);
      return result;
    }
    let result = await measure('initial import', initial);
    const identities = new Set(result.checkpoints.map((c) => c.id));
    const original = result;
    result = await measure('unchanged', result.checkpoints);
    expect(result.checkpoints).toEqual(original.checkpoints);
    result = await measure(
      'one timestamp',
      result.checkpoints.map((c, i) => (i === 2500 ? { ...c, timeOffsetSeconds: 6000 } : c))
    );
    result = await measure(
      'full reorder',
      result.checkpoints.map((c, i) => ({
        ...c,
        sortOrder: 4999 - i,
        checkpointKey: `key-${4999 - i}`,
        timeOffsetSeconds: 4999 - i,
      }))
    );
    expect(new Set(result.checkpoints.map((c) => c.id))).toEqual(identities);
    expect(result.checkpoints.map((c) => c.sortOrder)).toEqual(Array.from({ length: 5000 }, (_, i) => i));
    result = await measure(
      'all item edits',
      result.checkpoints.map((c) => ({
        ...c,
        questions: c.questions.map((q) => ({ ...q, prompt: `Revised ${q.prompt}` })),
      }))
    );
    expect(result.checkpoints.every((c) => c.questions[0].prompt.startsWith('Revised '))).toBe(true);
    result = await measure('replacement import', initial);
    expect(result.checkpoints).toHaveLength(5000);
    expect(result.checkpoints.every((c) => !identities.has(c.id))).toBe(true);
    console.info('Checkpoint batch benchmark (1 ms per operation):', JSON.stringify(timings));
  });
});
