/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { assignmentView, startAttempt, finishAttempt, submitLesson, type AttemptSnapshot } from './service';
const enabled = process.env.SUBMISSION_TEST_DATABASE_URL;
if (
  enabled &&
  (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(enabled).hostname) ||
    new URL(enabled).pathname !== '/spark_submission_test' ||
    process.env.DATABASE_URL !== enabled)
)
  throw new Error('Dedicated local submission test DB required');
const suite = enabled ? describe : describe.skip;
suite('course submissions in PostgreSQL', () => {
  jest.setTimeout(30000);
  let studentId: string, first: string, second: string, lessonId: string;
  beforeEach(async () => {
    const tag = randomUUID();
    studentId = (await prisma.user.create({ data: { email: `${tag}@example.com` } })).id;
    const lesson = await prisma.lesson.create({ data: { title: 'Test lesson', summary: '' } });
    lessonId = lesson.id;
    for (let n = 0; n < 2; n++) {
      const node = await prisma.node.create({
        data: {
          title: `Node ${n}`,
          quizQuestions: {
            create: Array.from({ length: n + 1 }, (_, i) => ({
              sortOrder: i,
              prompt: `Q${i}`,
              options: ['A', 'B'],
              correctIndices: [1],
            })),
          },
          ...(n === 0
            ? {
                checkpoints: {
                  create: {
                    checkpointKey: tag,
                    sortOrder: 0,
                    timeOffsetSeconds: 1,
                    questions: {
                      create: { sortOrder: 0, prompt: 'Checkpoint', options: ['A', 'B'], correctIndices: [1] },
                    },
                  },
                },
              }
            : {}),
        },
      });
      await prisma.lessonNode.create({
        data: { lessonId, nodeId: node.id, sortOrder: n, passingPercent: 70, quizQuestionCount: n + 1 },
      });
    }
    const ids = [];
    for (let c = 0; c < 2; c++) {
      const course = await prisma.course.create({
        data: {
          code: `${tag}-${c}`,
          title: 'Test course',
          enrollments: { create: { studentId } },
          courseLessons: {
            create: {
              lessonId,
              dueDate: new Date(Date.now() + 3600000),
              lateDeadline: new Date(Date.now() + 86400000),
              latePenaltyType: 'HOURLY',
              latePenaltyPercent: c === 0 ? 2 : 10,
            },
          },
        },
        include: { courseLessons: true },
      });
      ids.push(course.courseLessons[0].id);
    }
    [first, second] = ids;
  });
  afterAll(() => prisma.$disconnect());
  async function complete(assignmentId: string, wrongFirst = false) {
    const view = await assignmentView(studentId, assignmentId);
    for (const [index, node] of view.nodes.entries())
      for (const task of node.tasks) {
        const a = await startAttempt(studentId, assignmentId, node.id, task.kind, randomUUID());
        await finishAttempt(
          studentId,
          assignmentId,
          a.id,
          a.questions.map((q) => ({
            questionId: q.id,
            selectedIndices: wrongFirst && index === 0 && task.kind === 'QUIZ' ? [0] : [1],
          }))
        );
      }
  }
  it('requires complete work, averages nodes equally and isolates reused lessons by course', async () => {
    await expect(submitLesson(studentId, first, 'incomplete-key')).rejects.toThrow('Complete every');
    await complete(first, true);
    const result = await submitLesson(studentId, first, 'completed-key');
    expect(result.rawPercent).toBe(50);
    expect(result.finalPercent).toBe(50);
    expect(result.passed).toBe(false);
    const other = await assignmentView(studentId, second);
    expect(other.best).toBeNull();
    expect(other.nodes.every((n) => n.tasks.every((t) => !t.completed))).toBe(true);
  });
  it('keeps best final grade, applies a policy snapshot once and resolves ties to earlier submission', async () => {
    await complete(first);
    const a = await submitLesson(studentId, first, 'first-submission');
    const tie = await submitLesson(studentId, first, 'tie-submission');
    expect(tie.finalPercent).toBe(a.finalPercent);
    await prisma.courseLesson.update({
      where: { id: first },
      data: {
        dueDate: new Date(Date.now() - 3600000),
        lateDeadline: new Date(Date.now() + 3600000),
        latePenaltyType: 'FIXED',
        latePenaltyPercent: 10,
      },
    });
    const b = await submitLesson(studentId, first, 'late-submission');
    expect(b.finalPercent).toBe(90);
    expect((await assignmentView(studentId, first)).best?.id).toBe(a.id);
    expect((await prisma.lessonSubmission.findUniqueOrThrow({ where: { id: a.id } })).penaltyPercent).toBe(0);
  });
  it('deduplicates concurrent submissions and concurrent attempt completion', async () => {
    const node = (await assignmentView(studentId, first)).nodes[0];
    const [a, b] = await Promise.all([
      startAttempt(studentId, first, node.id, 'QUIZ', 'same-start-key'),
      startAttempt(studentId, first, node.id, 'QUIZ', 'same-start-key'),
    ]);
    expect(a.id).toBe(b.id);
    const answers = a.questions.map((q) => ({ questionId: q.id, selectedIndices: [1] }));
    await Promise.all([finishAttempt(studentId, first, a.id, answers), finishAttempt(studentId, first, a.id, answers)]);
    expect(await prisma.nodeResponse.count({ where: { attemptId: a.id } })).toBe(a.questions.length);
    await complete(first);
    const [one, two] = await Promise.all([
      submitLesson(studentId, first, 'same-submit-key'),
      submitLesson(studentId, first, 'same-submit-key'),
    ]);
    expect(one.id).toBe(two.id);
  });

  it('resumes one saved variant across concurrent starts and page reloads, then allows a new completed-attempt retry', async () => {
    const node = await prisma.lessonNode.findFirstOrThrow({ where: { lessonId }, orderBy: { sortOrder: 'asc' } });
    await prisma.quizQuestion.updateMany({
      where: { nodeId: node.nodeId },
      data: {
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
    });
    const [a, b] = await Promise.all([
      startAttempt(studentId, first, node.id, 'QUIZ', 'variant-start-one'),
      startAttempt(studentId, first, node.id, 'QUIZ', 'variant-start-two'),
    ]);
    expect(a).toEqual(b);
    expect(a.questions).toHaveLength(1);
    const saved = await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: a.id } });
    const question = (saved.snapshot as unknown as AttemptSnapshot).questions[0];
    expect(['salt', 'water']).toContain(question.variantId);
    expect((await assignmentView(studentId, first, a.id)).activeAttempt).toEqual(a);
    expect((await assignmentView(studentId, second, a.id)).activeAttempt).toBeNull();
    expect(await startAttempt(studentId, first, node.id, 'QUIZ', 'after-reload-key')).toEqual(a);
    expect(await prisma.nodeAttempt.count({ where: { progressId: saved.progressId, lessonNodeId: node.id } })).toBe(1);
    expect(JSON.stringify(a)).not.toMatch(/expectedAnswer|variantValues|variantId/);
    const answer = String((question.options as { expectedAnswer: number }).expectedAnswer);
    expect((await finishAttempt(studentId, first, a.id, [{ questionId: question.id, rawAnswer: answer }])).score).toBe(
      100
    );
    const retry = await startAttempt(studentId, first, node.id, 'QUIZ', 'variant-new-attempt');
    expect(retry.id).not.toBe(a.id);
  });
  it('keeps an unfinished legacy numeric attempt usable after the relational data migration', async () => {
    const node = await prisma.lessonNode.findFirstOrThrow({ where: { lessonId }, orderBy: { sortOrder: 'asc' } });
    const question = await prisma.quizQuestion.findFirstOrThrow({ where: { nodeId: node.nodeId } });
    await prisma.quizQuestion.update({
      where: { id: question.id },
      data: {
        prompt: '{{mass}} grams?',
        correctIndices: [],
        options: {
          type: 'variantShortAnswer',
          version: 1,
          variants: [
            {
              id: 'original',
              values: { mass: '12' },
              answer: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 12 },
            },
          ],
        },
      },
    });
    const started = await startAttempt(studentId, first, node.id, 'QUIZ', 'legacy-start');
    const before = await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: started.id } });
    await prisma.$executeRaw`INSERT INTO "QuizQuestionVariant" (id, "quizQuestionId", "sortOrder", values, answer)
      SELECT id || ':' || (options->'variants'->0->>'id'), id, 0, options->'variants'->0->'values', options->'variants'->0->'answer'
      FROM "QuizQuestion" WHERE id=${question.id}`;
    await prisma.$executeRaw`UPDATE "QuizQuestion" SET options=options-'variants' WHERE id=${question.id}`;
    expect((await assignmentView(studentId, first, started.id)).activeAttempt).toEqual(started);
    expect(await startAttempt(studentId, first, node.id, 'QUIZ', 'after-migration')).toEqual(started);
    expect((await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: started.id } })).snapshot).toEqual(
      before.snapshot
    );
    expect(
      (await finishAttempt(studentId, first, started.id, [{ questionId: question.id, rawAnswer: '12' }])).score
    ).toBe(100);
  });

  it('loads relational MCQ rows, persists variable-sized grading keys, and cascades rows without losing snapshots', async () => {
    const node = await prisma.lessonNode.findFirstOrThrow({ where: { lessonId }, orderBy: { sortOrder: 'asc' } });
    const question = await prisma.quizQuestion.findFirstOrThrow({ where: { nodeId: node.nodeId } });
    await prisma.quizQuestion.update({
      where: { id: question.id },
      data: {
        prompt: 'Select all {{kind}} numbers.',
        correctIndices: [],
        options: {
          type: 'variantMultipleChoice',
          version: 1,
          choices: [
            { id: 'a', content: '{{a}}' },
            { id: 'b', content: '{{b}}' },
            { id: 'c', content: '3' },
          ],
        },
        variants: {
          create: [
            {
              sortOrder: 0,
              values: { kind: 'even', a: '2', b: '5' },
              answer: { type: 'multipleChoice', correctChoiceIds: ['a'] },
            },
            {
              sortOrder: 1,
              values: { kind: 'even', a: '2', b: '4' },
              answer: { type: 'multipleChoice', correctChoiceIds: ['a', 'b'] },
            },
          ],
        },
      },
    });
    const [a, b] = await Promise.all([
      startAttempt(studentId, first, node.id, 'QUIZ', 'mcq-one'),
      startAttempt(studentId, first, node.id, 'QUIZ', 'mcq-two'),
    ]);
    expect(a).toEqual(b);
    expect(a.questions[0].choices).toHaveLength(3);
    expect(JSON.stringify(a)).not.toMatch(/correctChoiceIds|correctIndices|variantId/);
    const saved = await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: a.id } });
    const snapshot = saved.snapshot as unknown as AttemptSnapshot;
    expect((await assignmentView(studentId, first, a.id)).activeAttempt).toEqual(a);
    const key = snapshot.questions[0].correctIndices;
    expect([1, 2]).toContain(key.length);
    expect(
      (await finishAttempt(studentId, first, a.id, [{ questionId: question.id, selectedIndices: key }])).score
    ).toBe(100);
    await prisma.quizQuestion.delete({ where: { id: question.id } });
    expect(await prisma.quizQuestionVariant.count({ where: { quizQuestionId: question.id } })).toBe(0);
    expect((await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: a.id } })).snapshot).toEqual(saved.snapshot);
  });
  it('resumes a shared-choice MCQ attempt after migration to independent choices', async () => {
    const node = await prisma.lessonNode.findFirstOrThrow({ where: { lessonId }, orderBy: { sortOrder: 'asc' } });
    const q = await prisma.quizQuestion.findFirstOrThrow({ where: { nodeId: node.nodeId } });
    await prisma.quizQuestion.update({
      where: { id: q.id },
      data: {
        prompt: 'Select even numbers.',
        correctIndices: [],
        options: {
          type: 'variantMultipleChoice',
          version: 1,
          choices: [
            { id: 'a', content: '{{a}}' },
            { id: 'b', content: '{{b}}' },
          ],
        },
        variants: {
          create: {
            sortOrder: 0,
            values: { a: '2', b: '4' },
            answer: { type: 'multipleChoice', correctChoiceIds: ['a', 'b'] },
          },
        },
      },
    });
    const before = await startAttempt(studentId, first, node.id, 'QUIZ', 'shared-choices');
    const saved = await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: before.id } });
    await prisma.$executeRaw`UPDATE "QuizQuestionVariant" SET answer=answer || '{"choices":[{"id":"a","content":"2"},{"id":"b","content":"4"}]}'::jsonb WHERE "quizQuestionId"=${q.id}`;
    await prisma.$executeRaw`UPDATE "QuizQuestion" SET options=(options-'choices') || jsonb_build_object('version',2,'legacyChoices',options->'choices') WHERE id=${q.id}`;
    expect((await assignmentView(studentId, first, before.id)).activeAttempt).toEqual(before);
    expect(await startAttempt(studentId, first, node.id, 'QUIZ', 'own-choices')).toEqual(before);
    expect(
      (await finishAttempt(studentId, first, before.id, [{ questionId: q.id, selectedIndices: [0, 1] }])).score
    ).toBe(100);
    expect((await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: before.id } })).snapshot).toEqual(saved.snapshot);
    // Subsequent independent choice edits must invalidate the old content hash.
    await prisma.$executeRaw`UPDATE "QuizQuestionVariant" SET answer=jsonb_set(answer,'{choices,0,content}','"8"'::jsonb) WHERE "quizQuestionId"=${q.id}`;
    const after = await startAttempt(studentId, first, node.id, 'QUIZ', 'edited-choice');
    expect(after.questions[0].choices).toEqual(['8', '4']);
  });

  it('snapshots independently sized choice lists with independent answer counts', async () => {
    const node = await prisma.lessonNode.findFirstOrThrow({ where: { lessonId }, orderBy: { sortOrder: 'asc' } });
    const q = await prisma.quizQuestion.findFirstOrThrow({ where: { nodeId: node.nodeId } });
    await prisma.quizQuestion.update({
      where: { id: q.id },
      data: {
        prompt: 'Choose the correct elements.',
        correctIndices: [],
        options: { type: 'variantMultipleChoice', version: 2 },
        variants: {
          create: [
            {
              sortOrder: 0,
              values: {},
              answer: {
                type: 'multipleChoice',
                choices: [
                  { id: 'a', content: 'Sodium' },
                  { id: 'b', content: 'Potassium' },
                ],
                correctChoiceIds: ['a'],
              },
            },
            {
              sortOrder: 1,
              values: {},
              answer: {
                type: 'multipleChoice',
                choices: [
                  { id: 'x', content: 'Hydrogen' },
                  { id: 'y', content: 'Oxygen' },
                  { id: 'z', content: 'Nitrogen' },
                ],
                correctChoiceIds: ['x', 'y'],
              },
            },
          ],
        },
      },
    });
    const started = await startAttempt(studentId, first, node.id, 'QUIZ', 'independent');
    const saved = await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: started.id } });
    const question = (saved.snapshot as unknown as AttemptSnapshot).questions[0];
    expect([2, 3]).toContain(started.questions[0].choices!.length);
    expect(question.correctIndices.length).toBe(started.questions[0].choices!.length - 1);
    expect(await startAttempt(studentId, first, node.id, 'QUIZ', 'reload-independent')).toEqual(started);
    expect(
      (
        await finishAttempt(studentId, first, started.id, [
          { questionId: q.id, selectedIndices: question.correctIndices },
        ])
      ).score
    ).toBe(100);
  });
  it('preserves immutable answers and submissions when lesson nodes or questions are deleted', async () => {
    await complete(first);
    const submission = await submitLesson(studentId, first, 'history-key');
    const links = await prisma.submissionAttempt.findMany({ where: { submissionId: submission.id } });
    const attempt = await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: links[0].attemptId } });
    const snapshot = attempt.snapshot as unknown as AttemptSnapshot;
    await expect(
      prisma.lessonSubmission.update({ where: { id: submission.id }, data: { finalPercent: 0 } })
    ).rejects.toThrow();
    await expect(prisma.nodeAttempt.update({ where: { id: attempt.id }, data: { score: 0 } })).rejects.toThrow();
    await prisma.lessonNode.deleteMany({ where: { lessonId } });
    expect((await prisma.nodeAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).lessonNodeId).toBeNull();
    if (attempt.kind === 'QUIZ')
      await prisma.quizQuestion.deleteMany({ where: { id: { in: snapshot.questions.map((q) => q.id) } } });
    else await prisma.checkpointQuestion.deleteMany({ where: { id: { in: snapshot.questions.map((q) => q.id) } } });
    const responses = await prisma.nodeResponse.findMany({ where: { attemptId: attempt.id } });
    expect(responses).toHaveLength(snapshot.questions.length);
    expect(
      responses.every((response) => response.quizQuestionId === null && response.checkpointQuestionId === null)
    ).toBe(true);
    expect(responses[0].snapshot).toHaveProperty('prompt');
    expect((await assignmentView(studentId, first)).best?.id).toBe(submission.id);
  });
  it('rejects unauthorized students, wrong-course attempts and stale content', async () => {
    await expect(assignmentView('not-enrolled', first)).rejects.toThrow('not found');
    const node = (await assignmentView(studentId, first)).nodes[0];
    const attempt = await startAttempt(studentId, first, node.id, 'QUIZ', 'scope-start-key');
    await expect(finishAttempt(studentId, second, attempt.id, [])).rejects.toThrow('not found');
    await prisma.lessonNode.update({ where: { id: node.id }, data: { passingPercent: 90 } });
    await expect(finishAttempt(studentId, first, attempt.id, [])).rejects.toThrow('changed');
  });
  it('handles completion-only lessons and replays a prior submission after the window closes', async () => {
    await prisma.lessonNode.deleteMany({ where: { lessonId } });
    const sub = await submitLesson(studentId, first, 'completion-only-key');
    expect(sub.rawPercent).toBeNull();
    expect(sub.finalPercent).toBeNull();
    expect(sub.gradingStatus).toBe('COMPLETION_ONLY');
    await prisma.courseLesson.update({
      where: { id: first },
      data: {
        dueDate: new Date(0),
        lateDeadline: null,
        hideAfterDue: true,
        latePenaltyType: 'NONE',
        latePenaltyPercent: 0,
      },
    });
    expect((await submitLesson(studentId, first, 'completion-only-key')).id).toBe(sub.id);
    await expect(submitLesson(studentId, first, 'new-after-close')).rejects.toThrow('not accepted');
  });
});
