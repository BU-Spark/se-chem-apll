import { createHash, randomInt } from 'node:crypto';
import { Prisma, type AttemptKind } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isLessonHidden, submissionStatus } from '@/app/utils/lessonSubmissionPolicy';
import { getMultipleChoiceChoices } from '@/app/utils/multipleChoice';
import {
  quizVariantOptions,
  resolveQuizVariant,
  validateQuizVariants,
  renderQuestionVariant,
} from '@/app/utils/questionVariants';
import { gradeAnswer, lessonGrade, type AnswerInput, type QuestionSnapshot } from './grading';
export class SubmissionError extends Error {
  constructor(
    message: string,
    public status = 422
  ) {
    super(message);
  }
}
const include = {
  course: {
    select: { title: true, enrollments: { where: { role: 'STUDENT' as const }, select: { studentId: true } } },
  },
  lesson: {
    include: {
      lessonNodes: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          node: {
            include: {
              quizQuestions: {
                orderBy: { sortOrder: 'asc' as const },
                include: { variants: { orderBy: { sortOrder: 'asc' as const } } },
              },
              checkpoints: {
                orderBy: { sortOrder: 'asc' as const },
                include: {
                  questions: { where: { kind: 'QUESTION' as const }, orderBy: { sortOrder: 'asc' as const } },
                },
              },
            },
          },
        },
      },
    },
  },
};
type Assignment = Prisma.CourseLessonGetPayload<{ include: typeof include }>;
type Node = Assignment['lesson']['lessonNodes'][number];
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
function nodeKey(node: Node) {
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
function requiredKinds(node: Node): AttemptKind[] {
  const types: AttemptKind[] = [];
  if (node.node.quizQuestions.length) types.push('QUIZ');
  if (node.node.checkpoints.some((c) => c.questions.length)) types.push('CHECKPOINT');
  return types.length ? types : ['REVIEW'];
}
async function assignmentFor(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  studentId: string,
  allowHiddenReplay = false
) {
  const assignment = await tx.courseLesson.findUnique({ where: { id: assignmentId }, include });
  if (
    !assignment ||
    assignment.lesson.isDraft ||
    !assignment.course.enrollments.some((e) => e.studentId === studentId) ||
    (!allowHiddenReplay && isLessonHidden(assignment, new Date()))
  )
    throw new SubmissionError('Assignment not found.', 404);
  if (assignment.lesson.lessonNodes.some((n) => n.node.isDraft))
    throw new SubmissionError('This assignment contains unpublished work. Contact your instructor.', 409);
  return assignment;
}
function acceptWindow(assignment: Assignment) {
  const status = submissionStatus(assignment, new Date());
  if (status === 'CLOSED' || status === 'NOT_OPEN')
    throw new SubmissionError('Submissions are not accepted at this time.', 409);
}
async function lockedProgress(tx: Prisma.TransactionClient, studentId: string, courseLessonId: string) {
  const progress = await tx.courseLessonProgress.upsert({
    where: { studentId_courseLessonId: { studentId, courseLessonId } },
    create: { studentId, courseLessonId, status: 'IN_PROGRESS', startedAt: new Date() },
    update: {},
  });
  await tx.$queryRaw`SELECT id FROM "CourseLessonProgress" WHERE id = ${progress.id} FOR UPDATE`;
  return progress;
}
export async function serial<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let n = 0; ; n++)
    try {
      return await prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (e) {
      if (
        n < 3 &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (['P2034', 'P2002'].includes(e.code) ||
          (e.code === 'P2010' && ['40001', '40P01'].includes(String(e.meta?.code))))
      )
        continue;
      throw e;
    }
}
export type AttemptSnapshot = {
  nodeTitle: string;
  lessonNodeId: string;
  passingPercent: number;
  kind: AttemptKind;
  questions: QuestionSnapshot[];
};
function publicAttempt(attempt: {
  id: string;
  kind: AttemptKind;
  snapshot: Prisma.JsonValue;
  completedAt: Date | null;
  score: number | null;
}) {
  const snapshot = attempt.snapshot as unknown as AttemptSnapshot;
  return {
    id: attempt.id,
    kind: attempt.kind,
    nodeTitle: snapshot.nodeTitle,
    completedAt: attempt.completedAt,
    score: attempt.score,
    questions: snapshot.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: getMultipleChoiceChoices(q.options),
    })),
  };
}
export async function startAttempt(
  studentId: string,
  assignmentId: string,
  nodeId: string,
  kind: AttemptKind,
  key: string
) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId, true);
    const progress = await lockedProgress(tx, studentId, assignmentId);
    const existing = await tx.nodeAttempt.findUnique({
      where: { progressId_idempotencyKey: { progressId: progress.id, idempotencyKey: key } },
    });
    if (existing) {
      if (existing.lessonNodeId !== nodeId || existing.kind !== kind)
        throw new SubmissionError('Request key already used for different work.', 409);
      return publicAttempt(existing);
    }
    acceptWindow(assignment);
    const node = assignment.lesson.lessonNodes.find((n) => n.id === nodeId);
    if (!node || !requiredKinds(node).includes(kind)) throw new SubmissionError('Task not found.', 404);
    const contentKey = nodeKey(node);
    const unfinished = await tx.nodeAttempt.findFirst({
      where: { progressId: progress.id, lessonNodeId: node.id, kind, contentKey, completedAt: null },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
    if (unfinished) return publicAttempt(unfinished);
    let questions: QuestionSnapshot[] =
      kind === 'QUIZ'
        ? node.node.quizQuestions
        : kind === 'CHECKPOINT'
          ? node.node.checkpoints.flatMap((c) => c.questions)
          : [];
    if (kind === 'QUIZ') {
      if (node.quizQuestionCount < 1)
        throw new SubmissionError('Quiz sample size must be positive. Contact your instructor.', 409);
      questions = [...questions];
      for (let i = questions.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
      questions = questions.slice(0, node.quizQuestionCount);
    }
    const snapshot: AttemptSnapshot = {
      nodeTitle: node.node.title,
      lessonNodeId: node.id,
      passingPercent: node.passingPercent,
      kind,
      questions: questions.map((q) => {
        const variants = quizVariantOptions(q);
        if (variants) {
          if (kind !== 'QUIZ') throw new SubmissionError('Checkpoint variants are not supported.', 409);
          const error = validateQuizVariants(q.prompt, variants);
          if (error) throw new SubmissionError(`Invalid question variants. ${error}`, 409);
          return {
            id: q.id,
            ...resolveQuizVariant(q.prompt, variants, randomInt(variants.variants.length)),
          };
        }
        return { id: q.id, prompt: q.prompt, options: q.options, correctIndices: q.correctIndices };
      }),
    };
    return publicAttempt(
      await tx.nodeAttempt.create({
        data: {
          progressId: progress.id,
          courseLessonId: assignmentId,
          userId: studentId,
          lessonNodeId: node.id,
          kind,
          contentKey,
          idempotencyKey: key,
          snapshot: json(snapshot),
        },
      })
    );
  });
}
async function latestWork(tx: Prisma.TransactionClient, progressId: string, assignment: Assignment) {
  const attempts = await tx.nodeAttempt.findMany({
    where: { progressId, completedAt: { not: null } },
    orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
  });
  return assignment.lesson.lessonNodes.flatMap((node) =>
    requiredKinds(node).map((kind) => ({
      node,
      kind,
      attempt: attempts.find((a) => a.lessonNodeId === node.id && a.kind === kind && a.contentKey === nodeKey(node)),
    }))
  );
}
export async function finishAttempt(
  studentId: string,
  assignmentId: string,
  attemptId: string,
  answers: AnswerInput[]
) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId, true);
    const progress = await lockedProgress(tx, studentId, assignmentId);
    const attempt = await tx.nodeAttempt.findFirst({ where: { id: attemptId, progressId: progress.id } });
    if (!attempt) throw new SubmissionError('Attempt not found.', 404);
    if (attempt.completedAt) return publicAttempt(attempt);
    acceptWindow(assignment);
    const node = assignment.lesson.lessonNodes.find((n) => n.id === attempt.lessonNodeId);
    if (!node || nodeKey(node) !== attempt.contentKey)
      throw new SubmissionError('The lesson has changed. Start a new attempt.', 409);
    const snapshot = attempt.snapshot as unknown as AttemptSnapshot;
    if (
      answers.length !== snapshot.questions.length ||
      new Set(answers.map((a) => a.questionId)).size !== answers.length
    )
      throw new SubmissionError('Answer each question exactly once.');
    const responses = snapshot.questions.map((q) => {
      const answer = answers.find((a) => a.questionId === q.id);
      if (!answer) throw new SubmissionError('Missing answer.');
      let correct;
      try {
        correct = gradeAnswer(q, answer);
      } catch (e) {
        throw new SubmissionError((e as Error).message);
      }
      return {
        attemptId,
        studentId,
        questionKey: q.id,
        snapshot: json(q),
        quizQuestionId: attempt.kind === 'QUIZ' ? q.id : null,
        checkpointQuestionId: attempt.kind === 'CHECKPOINT' ? q.id : null,
        selectedIndices: answer.selectedIndices ?? [],
        rawAnswer: answer.rawAnswer ?? null,
        isCorrect: correct,
      };
    });
    if (responses.length) await tx.nodeResponse.createMany({ data: responses });
    const score =
      attempt.kind === 'QUIZ' ? (100 * responses.filter((r) => r.isCorrect).length) / responses.length : null;
    const finished = await tx.nodeAttempt.update({
      where: { id: attempt.id },
      data: { completedAt: new Date(), score, isPassing: score === null ? true : score >= snapshot.passingPercent },
    });
    const work = await latestWork(tx, progress.id, assignment);
    const percentComplete = work.length ? Math.floor((100 * work.filter((w) => w.attempt).length) / work.length) : 100;
    await tx.courseLessonProgress.update({ where: { id: progress.id }, data: { percentComplete } });
    return publicAttempt(finished);
  });
}
export async function submitLesson(studentId: string, assignmentId: string, key: string) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId, true);
    const progress = await lockedProgress(tx, studentId, assignmentId);
    const existing = await tx.lessonSubmission.findUnique({
      where: { progressId_idempotencyKey: { progressId: progress.id, idempotencyKey: key } },
    });
    if (existing) return existing;
    acceptWindow(assignment);
    const work = await latestWork(tx, progress.id, assignment);
    if (work.some((w) => !w.attempt))
      throw new SubmissionError(
        'Complete every quiz and checkpoint, and review nodes without questions, before submitting.'
      );
    const attempts = work.map((w) => w.attempt!);
    const scores = attempts.filter((a) => a.kind === 'QUIZ').map((a) => a.score!);
    const submittedAt = new Date();
    const grade = lessonGrade(scores, assignment, submittedAt);
    const previous = await tx.lessonSubmission.findFirst({
      where: { progressId: progress.id },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const snapshot = {
      version: 1,
      courseTitle: assignment.course.title,
      lessonTitle: assignment.lesson.title,
      courseLessonId: assignment.id,
      lessonId: assignment.lessonId,
      policy: {
        openDate: assignment.openDate,
        dueDate: assignment.dueDate,
        lateDeadline: assignment.lateDeadline,
        hideAfterDue: assignment.hideAfterDue,
        latePenaltyType: assignment.latePenaltyType,
        latePenaltyPercent: assignment.latePenaltyPercent,
      },
      hoursLate: assignment.dueDate ? Math.max(0, (submittedAt.getTime() - assignment.dueDate.getTime()) / 3600000) : 0,
      nodes: work
        .filter((w) => w.kind === 'QUIZ')
        .map((w) => ({
          title: w.node.node.title,
          attemptId: w.attempt!.id,
          score: w.attempt!.score,
          passingPercent: w.node.passingPercent,
        })),
      attemptIds: attempts.map((a) => a.id),
    };
    const submission = await tx.lessonSubmission.create({
      data: {
        progressId: progress.id,
        number: (previous?.number ?? 0) + 1,
        idempotencyKey: key,
        submittedAt,
        gradingStatus: scores.length ? 'GRADED' : 'COMPLETION_ONLY',
        ...grade,
        passed: attempts.every((a) => a.isPassing === true),
        snapshot: json(snapshot),
        attempts: { create: attempts.map((a) => ({ attemptId: a.id })) },
      },
    });
    await tx.courseLessonProgress.update({
      where: { id: progress.id },
      data: { status: 'COMPLETED', percentComplete: 100, completedAt: submittedAt },
    });
    return submission;
  });
}
export async function assignmentView(studentId: string, assignmentId: string, preferredAttemptId?: string) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId);
    const progress = await tx.courseLessonProgress.findUnique({
      where: { studentId_courseLessonId: { studentId, courseLessonId: assignmentId } },
    });
    const work = progress ? await latestWork(tx, progress.id, assignment) : [];
    const unfinished = progress
      ? await tx.nodeAttempt.findMany({
          where: { progressId: progress.id, completedAt: null },
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        })
      : [];
    const resumable = unfinished.filter((attempt) => {
      const node = assignment.lesson.lessonNodes.find((n) => n.id === attempt.lessonNodeId);
      return node && requiredKinds(node).includes(attempt.kind) && nodeKey(node) === attempt.contentKey;
    });
    const active = resumable.find((attempt) => attempt.id === preferredAttemptId) ?? resumable[0];
    const best = progress
      ? await tx.lessonSubmission.findFirst({
          where: { progressId: progress.id },
          orderBy: [{ finalPercent: { sort: 'desc', nulls: 'last' } }, { submittedAt: 'asc' }, { number: 'asc' }],
        })
      : null;
    return {
      id: assignment.id,
      courseId: assignment.courseId,
      courseTitle: assignment.course.title,
      title: assignment.lesson.title,
      policy: {
        openDate: assignment.openDate,
        dueDate: assignment.dueDate,
        lateDeadline: assignment.lateDeadline,
        hideAfterDue: assignment.hideAfterDue,
        latePenaltyType: assignment.latePenaltyType,
        latePenaltyPercent: assignment.latePenaltyPercent,
      },
      window: submissionStatus(assignment, new Date()),
      best,
      activeAttempt: active ? publicAttempt(active) : null,
      nodes: assignment.lesson.lessonNodes.map((node) => ({
        id: node.id,
        title: node.node.title,
        videoUrl: node.node.videoUrl,
        tasks: requiredKinds(node).map((kind) => {
          const attempt = work.find((w) => w.node.id === node.id && w.kind === kind)?.attempt;
          return {
            kind,
            completed: !!attempt,
            score: attempt?.score ?? null,
            inProgress: resumable.some((a) => a.lessonNodeId === node.id && a.kind === kind),
          };
        }),
      })),
    };
  });
}
