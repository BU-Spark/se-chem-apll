import { createHash, randomInt } from 'node:crypto';
import {
  Prisma,
  type AttemptKind,
  type AttemptPurpose,
  type NodeAttempt,
  type CourseLessonProgress,
} from '@prisma/client';
import { nodeKey, requiredKinds, workNodeInclude, type WorkNode } from './content';
import { evaluateWork } from './workState';
import { prisma } from '@/lib/prisma';
import { countFinishedNodes, toOutcomeNode } from '@/lib/nodeOutcomes';
import { isLessonHidden, submissionStatus } from '@/app/utils/lessonSubmissionPolicy';
import { getMultipleChoiceChoices } from '@/app/utils/multipleChoice';
import { quizVariantOptions, resolveQuizVariant, validateQuizVariants } from '@/app/utils/questionVariants';
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
      lessonNodeEdges: true,
      lessonNodes: {
        orderBy: { sortOrder: 'asc' as const },
        include: workNodeInclude,
      },
    },
  },
};
type Assignment = Prisma.CourseLessonGetPayload<{ include: typeof include }>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function assignmentFor(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  studentId: string,
  allowHiddenReplay = false,
  allowUnpublished = false
) {
  const assignment = await tx.courseLesson.findUnique({ where: { id: assignmentId }, include });
  if (
    !assignment ||
    assignment.lesson.isDraft ||
    !assignment.course.enrollments.some((e) => e.studentId === studentId) ||
    (!allowHiddenReplay && isLessonHidden(assignment, new Date()))
  )
    throw new SubmissionError('Assignment not found.', 404);
  if (!allowUnpublished && assignment.lesson.lessonNodes.some((n) => n.node.isDraft))
    throw new SubmissionError('This assignment contains unpublished work. Contact your instructor.', 409);
  return assignment;
}
function acceptWindow(assignment: Assignment, now = new Date()) {
  const status = submissionStatus(assignment, now);
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
  requiresVideo?: boolean;
};
function publicAttempt(
  attempt: {
    id: string;
    kind: AttemptKind;
    snapshot: Prisma.JsonValue;
    completedAt: Date | null;
    score: number | null;
    draftAnswers?: Prisma.JsonValue;
    videoCompletedAt?: Date | null;
    purpose?: AttemptPurpose;
  },
  node?: WorkNode
) {
  const snapshot = attempt.snapshot as unknown as AttemptSnapshot;
  return {
    id: attempt.id,
    kind: attempt.kind,
    lessonNodeId: snapshot.lessonNodeId,
    nodeTitle: snapshot.nodeTitle,
    completedAt: attempt.completedAt,
    score: attempt.score,
    draftAnswers: attempt.draftAnswers ?? [],
    videoCompletedAt: attempt.videoCompletedAt ?? null,
    purpose: attempt.purpose ?? 'STANDARD',
    requiresVideo:
      snapshot.requiresVideo ?? (attempt.kind !== 'QUIZ' && Boolean(node?.node.videoUrl || node?.node.muxPlaybackId)),
    questions: snapshot.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: getMultipleChoiceChoices(q.options),
      // Lets the student see "Select all that apply" without revealing which answers are correct.
      allowsMultiple: q.correctIndices.length > 1,
    })),
  };
}
export async function startAttempt(
  studentId: string,
  assignmentId: string,
  nodeId: string,
  kind: AttemptKind,
  key: string,
  attemptId?: string,
  purpose: AttemptPurpose = 'STANDARD'
) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId, true);
    const progress = await lockedProgress(tx, studentId, assignmentId);
    const existing = await tx.nodeAttempt.findUnique({
      where: { progressId_idempotencyKey: { progressId: progress.id, idempotencyKey: key } },
    });
    if (existing) {
      if (
        existing.lessonNodeId !== nodeId ||
        existing.kind !== kind ||
        existing.purpose !== purpose ||
        (attemptId && existing.id !== attemptId)
      )
        throw new SubmissionError('Request key already used for different work.', 409);
      return publicAttempt(
        existing,
        assignment.lesson.lessonNodes.find((n) => n.id === existing.lessonNodeId)
      );
    }
    acceptWindow(assignment);
    const node = assignment.lesson.lessonNodes.find((n) => n.id === nodeId);
    if (!node || !requiredKinds(node).includes(kind)) throw new SubmissionError('Task not found.', 404);
    const contentKey = nodeKey(node);
    const attempts = await tx.nodeAttempt.findMany({ where: { progressId: progress.id } });
    const hasSubmission = !!(await tx.lessonSubmission.findFirst({
      where: { progressId: progress.id },
      select: { id: true },
    }));
    const state = evaluateWork(
      assignment.lesson.lessonNodes,
      attempts,
      hasSubmission,
      assignment.lesson.lessonNodeEdges
    ).states.find((state) => state.id === node.id)!;
    if (!state.prerequisitesReady) throw new SubmissionError('Finish the updated prerequisite nodes first.', 409);
    const unfinished = await tx.nodeAttempt.findFirst({
      where: {
        ...(attemptId ? { id: attemptId } : {}),
        progressId: progress.id,
        lessonNodeId: node.id,
        kind,
        purpose,
        contentKey,
        completedAt: null,
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
    if (unfinished) return publicAttempt(unfinished, node);
    if (attemptId) throw new SubmissionError('Attempt is no longer available to resume. Reload the assignment.', 409);
    if (purpose === 'IMPROVEMENT' && (kind !== 'QUIZ' || !state.canImprove))
      throw new SubmissionError('One improvement attempt is available per node after submitting the lesson.', 409);
    if (purpose === 'STANDARD' && kind === 'QUIZ' && !state.canStartQuiz)
      throw new SubmissionError('No standard quiz attempts remain. Use Improve grade if it is available.', 409);
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
      requiresVideo: kind !== 'QUIZ' && Boolean(node.node.videoUrl || node.node.muxPlaybackId),
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
          purpose,
          contentKey,
          idempotencyKey: key,
          snapshot: json(snapshot),
        },
      })
    );
  });
}
async function loadWork(tx: Prisma.TransactionClient, progressId: string | undefined, assignment: Assignment) {
  const attempts = progressId
    ? await tx.nodeAttempt.findMany({
        where: { progressId, completedAt: { not: null } },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      })
    : [];
  const nodes = assignment.lesson.lessonNodes;
  const evaluation = evaluateWork(nodes, attempts, false, assignment.lesson.lessonNodeEdges);
  const work = evaluation.states.flatMap((state) =>
    state.tasks.map((task) => ({
      node: nodes.find((node) => node.id === state.id)!,
      ...task,
    }))
  );
  const outcomeNodes = nodes.filter((n) => !n.node.isDraft).map(toOutcomeNode);
  const finishedNodeCount = countFinishedNodes(outcomeNodes, attempts);
  const blockedReason = nodes.some((n) => n.node.isDraft)
    ? 'This lesson contains unpublished work. Contact your instructor.'
    : nodes.length === 0
      ? 'This lesson has no nodes yet.'
      : !evaluation.ready
        ? 'Finish every node and its required video questions before submitting. Updated nodes can be reopened from the roadmap.'
        : null;
  // Content and assignment identity prevent reuse for different work. The digest fits
  // the API key limit and is stable across reloads, tabs, retries and task ordering.
  const key =
    'roadmap:' +
    createHash('sha256')
      .update(
        JSON.stringify({
          assignmentId: assignment.id,
          attempts: work.flatMap((w) => (w.attempt ? [w.attempt.id] : [])).sort(),
        })
      )
      .digest('hex');
  return { work, finishedNodeCount, nodeCount: outcomeNodes.length, blockedReason, key };
}
type LessonWork = Awaited<ReturnType<typeof loadWork>>;

async function saveWorkProgress(
  tx: Prisma.TransactionClient,
  progress: CourseLessonProgress,
  state: LessonWork,
  now: Date
) {
  const completed =
    progress.status === 'COMPLETED' || (state.nodeCount > 0 && state.finishedNodeCount === state.nodeCount);
  await tx.courseLessonProgress.update({
    where: { id: progress.id },
    data: {
      status: completed ? 'COMPLETED' : 'IN_PROGRESS',
      percentComplete: completed
        ? 100
        : state.nodeCount
          ? Math.round((100 * state.finishedNodeCount) / state.nodeCount)
          : 0,
      completedAt: completed ? (progress.completedAt ?? now) : null,
    },
  });
}

async function submitReadyWork(
  tx: Prisma.TransactionClient,
  assignment: Assignment,
  progress: CourseLessonProgress,
  state: LessonWork,
  now: Date
) {
  // A replay after closing may recover existing work, but must never create a late hand-in.
  if (state.blockedReason) return;
  const existing = await tx.lessonSubmission.findUnique({
    where: { progressId_idempotencyKey: { progressId: progress.id, idempotencyKey: state.key } },
  });
  if (existing) return existing;
  if (!['ON_TIME', 'LATE'].includes(submissionStatus(assignment, now))) return;
  return createSubmission(tx, assignment, progress, state.work, state.key, now);
}
export async function finishAttempt(
  studentId: string,
  assignmentId: string,
  attemptId: string,
  answers: AnswerInput[],
  submitWhenReady = false,
  videoEnded = false
) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId, true);
    const progress = await lockedProgress(tx, studentId, assignmentId);
    const attempt = await tx.nodeAttempt.findFirst({ where: { id: attemptId, progressId: progress.id } });
    if (!attempt) throw new SubmissionError('Attempt not found.', 404);
    const now = new Date();
    if (attempt.completedAt) {
      if (submitWhenReady) {
        const state = await loadWork(tx, progress.id, assignment);
        await saveWorkProgress(tx, progress, state, now);
        await submitReadyWork(tx, assignment, progress, state, now);
      }
      return publicAttempt(attempt);
    }
    acceptWindow(assignment, now);
    const node = assignment.lesson.lessonNodes.find((n) => n.id === attempt.lessonNodeId);
    if (!node || nodeKey(node) !== attempt.contentKey)
      throw new SubmissionError('The lesson has changed. Start a new attempt.', 409);
    if (attempt.kind !== 'QUIZ' && (node.node.videoUrl || node.node.muxPlaybackId) && !attempt.videoCompletedAt) {
      if (!videoEnded) throw new SubmissionError('Finish the video before completing this attempt.', 409);
      await tx.nodeAttempt.update({ where: { id: attempt.id }, data: { videoCompletedAt: now } });
    }
    await checkPrerequisites(tx, assignment, progress.id, node.id);
    return finalizeAttempt(tx, assignment, progress, attempt, answers, now, submitWhenReady);
  });
}

async function checkPrerequisites(
  tx: Prisma.TransactionClient,
  assignment: Assignment,
  progressId: string,
  nodeId: string
) {
  const attempts = await tx.nodeAttempt.findMany({ where: { progressId } });
  const state = evaluateWork(
    assignment.lesson.lessonNodes,
    attempts,
    false,
    assignment.lesson.lessonNodeEdges
  ).states.find((s) => s.id === nodeId);
  if (!state?.prerequisitesReady) throw new SubmissionError('Finish the updated prerequisite nodes first.', 409);
}

async function finalizeAttempt(
  tx: Prisma.TransactionClient,
  assignment: Assignment,
  progress: CourseLessonProgress,
  attempt: NodeAttempt,
  answers: AnswerInput[],
  now: Date,
  submitWhenReady: boolean
) {
  const attemptId = attempt.id;
  const snapshot = attempt.snapshot as unknown as AttemptSnapshot;
  if (answers.length !== snapshot.questions.length || new Set(answers.map((a) => a.questionId)).size !== answers.length)
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
      studentId: progress.studentId,
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
  const score = attempt.kind === 'QUIZ' ? (100 * responses.filter((r) => r.isCorrect).length) / responses.length : null;
  const finished = await tx.nodeAttempt.update({
    where: { id: attempt.id },
    data: { completedAt: now, score, isPassing: score === null ? true : score >= snapshot.passingPercent },
  });
  const state = await loadWork(tx, progress.id, assignment);
  await saveWorkProgress(tx, progress, state, now);
  if (submitWhenReady) await submitReadyWork(tx, assignment, progress, state, now);
  return publicAttempt(finished);
}

/** Saves checkpoint drafts without counting them toward completion. Both event orders are safe. */
export async function saveCheckpoint(
  studentId: string,
  assignmentId: string,
  attemptId: string,
  answer?: AnswerInput,
  videoEnded = false
) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId, true);
    const progress = await lockedProgress(tx, studentId, assignmentId);
    const attempt = await tx.nodeAttempt.findFirst({
      where: { id: attemptId, progressId: progress.id, kind: 'CHECKPOINT' },
    });
    if (!attempt) throw new SubmissionError('Attempt not found.', 404);
    const snapshot = attempt.snapshot as unknown as AttemptSnapshot;
    const question = answer && snapshot.questions.find((q) => q.id === answer.questionId);
    let correct: boolean | undefined;
    if (answer) {
      if (!question) throw new SubmissionError('Question not found.', 404);
      try {
        correct = gradeAnswer(question, answer);
      } catch (e) {
        throw new SubmissionError((e as Error).message, 400);
      }
    }
    if (attempt.completedAt) return { ...publicAttempt(attempt), correct };
    const now = new Date();
    acceptWindow(assignment, now);
    const node = assignment.lesson.lessonNodes.find((n) => n.id === attempt.lessonNodeId);
    if (!node || nodeKey(node) !== attempt.contentKey)
      throw new SubmissionError('The lesson has changed. Return to the node to start updated work.', 409);
    await checkPrerequisites(tx, assignment, progress.id, node.id);
    const drafts = attempt.draftAnswers as unknown as AnswerInput[];
    const answers = answer ? [...drafts.filter((a) => a.questionId !== answer.questionId), answer] : drafts;
    const updated = await tx.nodeAttempt.update({
      where: { id: attempt.id },
      data: {
        draftAnswers: json(answers),
        ...(videoEnded && !attempt.videoCompletedAt ? { videoCompletedAt: now } : {}),
      },
    });
    const requiresVideo = Boolean(node.node.videoUrl || node.node.muxPlaybackId);
    if (answers.length === snapshot.questions.length && (!requiresVideo || updated.videoCompletedAt)) {
      return { ...(await finalizeAttempt(tx, assignment, progress, updated, answers, now, true)), correct };
    }
    return { ...publicAttempt(updated), correct };
  });
}

export async function submitLesson(studentId: string, assignmentId: string, key: string, roadmap = false) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId, true);
    const progress = await lockedProgress(tx, studentId, assignmentId);
    const existing = await tx.lessonSubmission.findUnique({
      where: { progressId_idempotencyKey: { progressId: progress.id, idempotencyKey: key } },
    });
    if (existing) return existing;
    const now = new Date();
    acceptWindow(assignment, now);
    const state = await loadWork(tx, progress.id, assignment);
    if (roadmap) {
      if (state.blockedReason) throw new SubmissionError(state.blockedReason, 409);
      if (key !== state.key)
        throw new SubmissionError('Your work has changed. Reload the lesson and retry submission.', 409);
    }
    if (state.work.some((w) => !w.attempt))
      throw new SubmissionError(
        'Complete every quiz and checkpoint, and review nodes without questions, before submitting.'
      );
    return createSubmission(tx, assignment, progress, state.work, key, now);
  });
}

async function createSubmission(
  tx: Prisma.TransactionClient,
  assignment: Assignment,
  progress: CourseLessonProgress,
  work: LessonWork['work'],
  key: string,
  submittedAt: Date
) {
  const attempts = work.map((w) => w.attempt!);
  const scores = attempts.filter((a) => a.kind === 'QUIZ').map((a) => a.score!);
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
}

/** Read-only roadmap hand-in state. No mutation occurs while rendering or prefetching. */
export async function lessonSubmissionView(studentId: string, assignmentId: string) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId, false, true);
    const progress = await tx.courseLessonProgress.findUnique({
      where: { studentId_courseLessonId: { studentId, courseLessonId: assignmentId } },
    });
    const state = await loadWork(tx, progress?.id, assignment);
    const select = {
      id: true,
      number: true,
      submittedAt: true,
      rawPercent: true,
      penaltyPercent: true,
      finalPercent: true,
      gradingStatus: true,
      passed: true,
    };
    const latest = progress
      ? await tx.lessonSubmission.findFirst({
          where: { progressId: progress.id },
          orderBy: { number: 'desc' },
          select,
        })
      : null;
    const best = progress
      ? await tx.lessonSubmission.findFirst({
          where: { progressId: progress.id },
          orderBy: [{ finalPercent: { sort: 'desc', nulls: 'last' } }, { submittedAt: 'asc' }, { number: 'asc' }],
          select,
        })
      : null;
    const submitted = progress
      ? await tx.lessonSubmission.findUnique({
          where: { progressId_idempotencyKey: { progressId: progress.id, idempotencyKey: state.key } },
          select: { id: true },
        })
      : null;
    return {
      window: submissionStatus(assignment, new Date()),
      dueDate: assignment.dueDate?.toISOString() ?? null,
      lateDeadline: assignment.lateDeadline?.toISOString() ?? null,
      latePenaltyType: assignment.latePenaltyType,
      latePenaltyPercent: assignment.latePenaltyPercent,
      blockedReason: state.blockedReason,
      pendingKey: state.blockedReason || submitted ? null : state.key,
      latest: latest ? { ...latest, submittedAt: latest.submittedAt.toISOString() } : null,
      best: best ? { ...best, submittedAt: best.submittedAt.toISOString() } : null,
    };
  });
}
export type LessonSubmissionView = Awaited<ReturnType<typeof lessonSubmissionView>>;

export async function assignmentView(studentId: string, assignmentId: string, preferredAttemptId?: string) {
  return serial(async (tx) => {
    const assignment = await assignmentFor(tx, assignmentId, studentId);
    const progress = await tx.courseLessonProgress.findUnique({
      where: { studentId_courseLessonId: { studentId, courseLessonId: assignmentId } },
    });
    const work = (await loadWork(tx, progress?.id, assignment)).work;
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
      activeAttempt: active
        ? publicAttempt(
            active,
            assignment.lesson.lessonNodes.find((n) => n.id === active.lessonNodeId)
          )
        : null,
      nodes: assignment.lesson.lessonNodes.map((node) => ({
        id: node.id,
        title: node.node.title,
        videoUrl: node.node.videoUrl,
        tasks: work
          .filter((w) => w.node.id === node.id)
          .map(({ kind, attempt }) => {
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
