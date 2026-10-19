/** @jest-environment node */
import type { AttemptKind, Prisma } from '@prisma/client';
import { assignmentView, finishAttempt, startAttempt } from './service';
import type { AttemptSnapshot } from './service';

const mockRandomInt = jest.fn();
jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomInt: (...args: unknown[]) => mockRandomInt(...args),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: (work: (tx: unknown) => unknown) => work(mockTx) },
}));

function assignment() {
  return {
    id: 'assignment',
    courseId: 'course',
    openDate: null,
    dueDate: null,
    lateDeadline: null,
    hideAfterDue: false,
    latePenaltyType: 'NONE',
    latePenaltyPercent: 0,
    course: { title: 'Chemistry', enrollments: [{ studentId: 'student' }] },
    lesson: {
      title: 'Moles',
      isDraft: false,
      lessonNodes: [
        {
          id: 'lesson-node',
          passingPercent: 70,
          quizQuestionCount: 1,
          node: {
            title: 'Mass to moles',
            isDraft: false,
            videoUrl: null,
            checkpoints: [],
            quizQuestions: [
              {
                id: 'question',
                prompt: 'Moles of {{compound}} in {{mass}} g?',
                correctIndices: [],
                options: {
                  type: 'variantShortAnswer',
                  version: 1,
                  variants: [
                    {
                      id: 'salt',
                      values: { compound: 'NaCl', mass: '58.44' },
                      answer: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 1 },
                    },
                    {
                      id: 'water',
                      values: { compound: 'H2O', mass: '36.03' },
                      answer: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 2 },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}
type StoredAttempt = {
  id: string;
  progressId: string;
  lessonNodeId: string;
  kind: AttemptKind;
  contentKey: string;
  idempotencyKey: string;
  snapshot: Prisma.JsonValue;
  startedAt: Date;
  completedAt: Date | null;
  score: number | null;
};
let mockAssignment = assignment();
let mockAttempts: StoredAttempt[] = [];
const mockTx = {
  $queryRaw: jest.fn(),
  courseLesson: { findUnique: jest.fn(async () => mockAssignment) },
  courseLessonProgress: {
    upsert: jest.fn(async () => ({ id: 'progress' })),
    findUnique: jest.fn(async () => ({ id: 'progress' })),
    update: jest.fn(),
  },
  lessonSubmission: { findFirst: jest.fn(async () => null) },
  nodeAttempt: {
    findUnique: jest.fn(
      async ({ where }: { where: { progressId_idempotencyKey: { idempotencyKey: string } } }) =>
        mockAttempts.find((a) => a.idempotencyKey === where.progressId_idempotencyKey.idempotencyKey) ?? null
    ),
    findFirst: jest.fn(
      async ({ where }: { where: Partial<StoredAttempt> }) =>
        [...mockAttempts]
          .reverse()
          .find((a) => Object.entries(where).every(([key, value]) => a[key as keyof StoredAttempt] === value)) ?? null
    ),
    findMany: jest.fn(async ({ where }: { where: { completedAt: null | { not: null } } }) =>
      [...mockAttempts]
        .reverse()
        .filter((a) => (where.completedAt === null ? a.completedAt === null : a.completedAt !== null))
    ),
    create: jest.fn(async ({ data }: { data: Omit<StoredAttempt, 'id' | 'startedAt' | 'completedAt' | 'score'> }) => {
      const attempt = {
        ...data,
        id: `attempt-${mockAttempts.length + 1}`,
        startedAt: new Date(),
        completedAt: null,
        score: null,
      };
      mockAttempts.push(attempt);
      return attempt;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredAttempt> }) => {
      const attempt = mockAttempts.find((a) => a.id === where.id)!;
      Object.assign(attempt, data);
      return attempt;
    }),
  },
  nodeResponse: { createMany: jest.fn() },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAttempts = [];
  mockAssignment = assignment();
  mockRandomInt.mockReturnValue(1);
});

it('selects one complete variant, resumes it across new requests, and restores it in the assignment view without exposing answers', async () => {
  const first = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'first-key');
  expect(first.questions).toEqual([{ id: 'question', prompt: 'Moles of H2O in 36.03 g?', choices: null }]);
  expect(mockRandomInt).toHaveBeenCalledWith(2);
  expect((mockAttempts[0].snapshot as unknown as AttemptSnapshot).questions[0]).toMatchObject({
    variantId: 'water',
    variantValues: { compound: 'H2O', mass: '36.03' },
    options: { expectedAnswer: 2 },
  });
  mockRandomInt.mockReturnValue(0);
  expect(await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'new-browser-key')).toEqual(first);
  expect(await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'first-key')).toEqual(first);
  const reloaded = await assignmentView('student', 'assignment', first.id);
  expect(reloaded.activeAttempt).toEqual(first);
  expect(reloaded.nodes[0].tasks[0].inProgress).toBe(true);
  expect(mockRandomInt).toHaveBeenCalledTimes(1);
  expect(mockTx.nodeAttempt.create).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(reloaded)).not.toMatch(/expectedAnswer|variantValues|variantId|NaCl/);
});

it('grades the saved variant and draws again only after the previous attempt is completed', async () => {
  const first = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'first-key');
  const completed = await finishAttempt('student', 'assignment', first.id, [
    { questionId: 'question', rawAnswer: '2' },
  ]);
  expect(completed.score).toBe(100);
  expect(mockTx.nodeResponse.createMany).toHaveBeenCalledWith({
    data: [
      expect.objectContaining({
        isCorrect: true,
        quizQuestionId: 'question',
        questionKey: 'question',
        snapshot: expect.objectContaining({ variantId: 'water' }),
      }),
    ],
  });
  expect((await assignmentView('student', 'assignment')).activeAttempt).toBeNull();
  mockRandomInt.mockReturnValue(0);
  const retry = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'retry-key');
  expect(retry.id).not.toBe(first.id);
  expect(retry.questions[0].prompt).toContain('NaCl');
  expect(
    (await finishAttempt('student', 'assignment', retry.id, [{ questionId: 'question', rawAnswer: '2' }])).score
  ).toBe(0);
});

it('restores the requested unfinished task when a student has opened more than one node', async () => {
  const other = structuredClone(mockAssignment.lesson.lessonNodes[0]);
  other.id = 'other-node';
  mockAssignment.lesson.lessonNodes.push(other);
  const first = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'first-key');
  const second = await startAttempt('student', 'assignment', 'other-node', 'QUIZ', 'other-key');
  expect((await assignmentView('student', 'assignment')).activeAttempt?.id).toBe(second.id);
  expect((await assignmentView('student', 'assignment', first.id)).activeAttempt?.id).toBe(first.id);
});

it('resumes the selected older attempt when duplicate unfinished attempts exist', async () => {
  const first = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'first-key');
  // Simulate duplicate attempts created before starts reused unfinished work.
  mockAttempts[0].completedAt = new Date();
  mockRandomInt.mockReturnValue(0);
  const newer = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'newer-key');
  mockAttempts[0].completedAt = null;
  expect(newer.questions).not.toEqual(first.questions);
  const selected = (await assignmentView('student', 'assignment', first.id)).activeAttempt!;
  expect(selected.id).toBe(first.id);
  expect(await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'resume-key', selected.id)).toEqual(first);
  expect(await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'default-key')).toEqual(newer);
  await expect(startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'newer-key', first.id)).rejects.toThrow(
    'Request key already used'
  );
  expect(mockTx.nodeAttempt.create).toHaveBeenCalledTimes(2);
  expect(mockRandomInt).toHaveBeenCalledTimes(2);
});

it.each([
  { progressId: 'another-progress' },
  { lessonNodeId: 'another-node' },
  { kind: 'CHECKPOINT' as const },
  { contentKey: 'stale' },
  { completedAt: new Date() },
  { id: 'missing' },
])('rejects a selected attempt that is no longer resumable: %o', async (changes) => {
  const first = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'first-key');
  Object.assign(mockAttempts[0], changes);
  await expect(startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'resume-key', first.id)).rejects.toThrow(
    'Attempt is no longer available to resume'
  );
  expect(mockTx.nodeAttempt.create).toHaveBeenCalledTimes(1);
});

it('excludes stale attempts after an instructor edits variants, retaining their original snapshots', async () => {
  const first = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'first-key');
  mockAssignment.lesson.lessonNodes[0].node.quizQuestions[0].options.variants[1].values.mass = '72.06';
  expect((await assignmentView('student', 'assignment', first.id)).activeAttempt).toBeNull();
  await expect(
    finishAttempt('student', 'assignment', first.id, [{ questionId: 'question', rawAnswer: '2' }])
  ).rejects.toThrow('lesson has changed');
  const next = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'updated-key');
  expect(next.id).not.toBe(first.id);
  expect(next.questions[0].prompt).toContain('72.06');
  expect((mockAttempts[0].snapshot as unknown as AttemptSnapshot).questions[0].prompt).toContain('36.03');
});

it('does not resume another student’s work', async () => {
  const first = await startAttempt('student', 'assignment', 'lesson-node', 'QUIZ', 'first-key');
  await expect(assignmentView('outsider', 'assignment', first.id)).rejects.toThrow('Assignment not found');
});
