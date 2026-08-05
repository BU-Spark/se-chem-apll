import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { areIndexSetsEqual, getMultipleChoiceChoices } from '@/app/utils/multipleChoice';
import { gradeShortAnswer, parseShortAnswerOptions, ParsedShortAnswer } from '@/app/utils/shortAnswer';

import { effectiveQuizQuestionCount } from '@/app/utils/quizQuestionCount';

interface RouteContext {
  params: Promise<{ lessonNodeId: string }>;
}

type AnswerInput = {
  questionId: string;
  selectedIndices?: unknown;
  rawAnswer?: string;
};

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const normalizedEmail = email.toLowerCase();

  const student = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const { lessonNodeId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { answers } = body as { answers?: AnswerInput[] };
  if (!answers || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'answers array is required' }, { status: 400 });
  }

  const lessonNode = await prisma.lessonNode.findUnique({
    where: { id: lessonNodeId },
    include: {
      lesson: true,
      node: {
        include: {
          questions: {
            where: { isPreLecture: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  });

  if (!lessonNode) return NextResponse.json({ error: 'Lesson node not found' }, { status: 404 });

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      studentId_courseId: {
        studentId: student.id,
        courseId: lessonNode.lesson.courseId,
      },
    },
  });
  if (!enrollment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const bankQuestions = lessonNode.node.questions;
  if (bankQuestions.length === 0) {
    return NextResponse.json({ error: 'No pre-quiz configured for this node' }, { status: 422 });
  }

  // figures out how many questions count, validates the submitted answers
  // this is it ensure the api expects the same number of answer and only accepts IDs from the real bank
  const quizCount = effectiveQuizQuestionCount(lessonNode.quizQuestionCount, bankQuestions.length);
  if (quizCount === 0) {
    return NextResponse.json({ error: 'No pre-quiz configured for this node' }, { status: 422 });
  }

  const bankById = new Map(bankQuestions.map((q) => [q.id, q]));
  const answerQuestionIds = answers.map((a) => a.questionId);
  const uniqueIds = new Set(answerQuestionIds);

  if (uniqueIds.size !== quizCount || answerQuestionIds.length !== quizCount) {
    return NextResponse.json({ error: `Pre-quiz requires exactly ${quizCount} answers` }, { status: 422 });
  }

  // building the questions list so that it can be graded
  const preQuestions: typeof bankQuestions = [];
  for (const id of uniqueIds) {
    const question = bankById.get(id);
    if (!question) {
      return NextResponse.json({ error: 'Invalid pre-quiz question' }, { status: 422 });
    }
    preQuestions.push(question);
  }

  const answerByQuestionId = new Map(answers.map((a) => [a.questionId, a]));

  function parseQuestionFormat(
    options: unknown
  ): { type: 'multipleChoice'; choices: string[] } | ParsedShortAnswer | null {
    const choices = getMultipleChoiceChoices(options);
    return choices ? { type: 'multipleChoice', choices } : parseShortAnswerOptions(options);
  }

  for (const q of preQuestions) {
    const answer = answerByQuestionId.get(q.id);
    const format = parseQuestionFormat(q.options);
    if (!format) {
      return NextResponse.json({ error: `Unsupported question format: ${q.id}` }, { status: 422 });
    }
    if (!answer) {
      return NextResponse.json({ error: 'All pre-quiz questions must be answered' }, { status: 422 });
    }
    if (format.type === 'multipleChoice') {
      const selectedIndices = answer.selectedIndices;
      if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) {
        return NextResponse.json({ error: 'All pre-quiz questions must be answered' }, { status: 422 });
      }
      if (
        selectedIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= format.choices.length) ||
        new Set(selectedIndices).size !== selectedIndices.length
      ) {
        return NextResponse.json({ error: `Invalid answer selection: ${q.id}` }, { status: 422 });
      }
    }
    if (format.type === 'shortAnswer' && String(answer.rawAnswer ?? '').trim().length === 0) {
      return NextResponse.json({ error: 'All pre-quiz questions must be answered' }, { status: 422 });
    }
  }

  const passingPercent = lessonNode.passingPercent;

  const result = await prisma.$transaction(async (tx) => {
    const attempt = await tx.nodeAttempt.create({
      data: {
        lessonNodeId,
        userId: student.id,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    let correctCount = 0;
    for (const q of preQuestions) {
      const answer = answerByQuestionId.get(q.id);
      const format = parseQuestionFormat(q.options);
      if (!format) {
        throw new Error(`Unsupported question format: ${q.id}`);
      }
      const selectedIndices = Array.isArray(answer?.selectedIndices) ? (answer.selectedIndices as number[]) : [];
      const rawAnswer = answer?.rawAnswer ?? null;
      let isCorrect: boolean | null = null;

      if (format.type === 'multipleChoice') {
        isCorrect = q.correctIndices.length > 0 ? areIndexSetsEqual(selectedIndices, q.correctIndices) : null;
      } else {
        isCorrect = gradeShortAnswer(q.options, rawAnswer);
      }

      if (isCorrect === true) correctCount += 1;

      await tx.nodeResponse.create({
        data: {
          attemptId: attempt.id,
          questionId: q.id,
          studentId: student.id,
          selectedIndices,
          rawAnswer,
          isCorrect,
        },
      });
    }

    const totalQuestions = preQuestions.length;
    const score = Math.round((correctCount / totalQuestions) * 100);
    const passed = score >= passingPercent;

    await tx.nodeAttempt.update({
      where: { id: attempt.id },
      data: {
        score,
        isPassing: passed,
      },
    });

    const progress = await tx.lessonProgress.findUnique({
      where: {
        studentId_lessonId: {
          studentId: student.id,
          lessonId: lessonNode.lessonId,
        },
      },
    });

    if (!progress) {
      await tx.lessonProgress.create({
        data: {
          studentId: student.id,
          lessonId: lessonNode.lessonId,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          percentComplete: 10,
        },
      });
    } else if (progress.status === 'NOT_STARTED') {
      await tx.lessonProgress.update({
        where: { id: progress.id },
        data: {
          status: 'IN_PROGRESS',
          startedAt: progress.startedAt ?? new Date(),
          percentComplete: Math.max(progress.percentComplete, 10),
        },
      });
    }

    return { score, passed, totalQuestions, correctAnswers: correctCount };
  });

  return NextResponse.json(result);
}
