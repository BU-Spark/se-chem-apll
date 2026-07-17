import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ lessonNodeId: string }>;
}

type AnswerInput = {
  questionId: string;
  selectedIndex?: number;
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

  const preQuestions = lessonNode.node.questions;
  if (preQuestions.length === 0) {
    return NextResponse.json({ error: 'No pre-quiz configured for this node' }, { status: 422 });
  }

  const answerByQuestionId = new Map(answers.map((a) => [a.questionId, a]));

  function parseQuestionFormat(
    options: unknown
  ):
    | { type: 'multipleChoice'; choices: string[] }
    | { type: 'shortAnswer'; expectedAnswer: number; tolerancePercent: number }
    | null {
    if (Array.isArray(options) && options.every((v) => typeof v === 'string')) {
      return { type: 'multipleChoice', choices: options };
    }
    if (options && typeof options === 'object') {
      const opt = options as {
        type?: string;
        choices?: unknown;
        expectedAnswer?: unknown;
        tolerancePercent?: unknown;
      };
      if (opt.type === 'multipleChoice' && Array.isArray(opt.choices)) {
        return { type: 'multipleChoice', choices: opt.choices.map((c) => String(c)) };
      }
      if (opt.type === 'shortAnswer') {
        return {
          type: 'shortAnswer',
          expectedAnswer: Number(opt.expectedAnswer),
          tolerancePercent: Number(opt.tolerancePercent ?? 0),
        };
      }
    }
    return null;
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
    if (format.type === 'multipleChoice' && answer.selectedIndex === undefined) {
      return NextResponse.json({ error: 'All pre-quiz questions must be answered' }, { status: 422 });
    }
    if (format.type === 'shortAnswer' && String(answer.rawAnswer ?? '').trim().length === 0) {
      return NextResponse.json({ error: 'All pre-quiz questions must be answered' }, { status: 422 });
    }
  }

  const passingPercent =
    lessonNode.passingPercentOverride !== null
      ? lessonNode.passingPercentOverride
      : lessonNode.node.defaultPassingPercent;

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
      const selectedIndex = answer?.selectedIndex ?? null;
      const rawAnswer = answer?.rawAnswer ?? null;
      let isCorrect: boolean | null = null;

      if (format.type === 'multipleChoice') {
        isCorrect = selectedIndex !== null && q.correctIndex !== null ? selectedIndex === q.correctIndex : null;
      } else {
        const submitted = Number(rawAnswer);
        if (!Number.isNaN(submitted) && Number.isFinite(submitted)) {
          const expected = format.expectedAnswer;
          const tolerance = Math.abs(expected) * (format.tolerancePercent / 100);
          isCorrect = Math.abs(submitted - expected) <= tolerance;
        }
      }

      if (isCorrect === true) correctCount += 1;

      await tx.nodeResponse.create({
        data: {
          attemptId: attempt.id,
          questionId: q.id,
          studentId: student.id,
          selectedIndex,
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
