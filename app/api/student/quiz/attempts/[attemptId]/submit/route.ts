import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentStudent } from '@/lib/currentStudent';
import { getAttemptQuestions } from '@/lib/attemptQuestions';
import { gradeQuizAttempt, validateQuizAnswers, type QuizAnswerInput } from '@/app/utils/quizGrading';

interface RouteContext {
  params: Promise<{ attemptId: string }>;
}

// POST /api/student/quiz/attempts/[attemptId]/submit — grade and save a quiz attempt
export async function POST(req: NextRequest, { params }: RouteContext) {
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { answers } = (body ?? {}) as { answers?: QuizAnswerInput[] };
  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: 'answers array is required' }, { status: 400 });
  }

  const { attemptId } = await params;

  // Only the student who owns the attempt can submit it.
  const attempt = await prisma.nodeAttempt.findFirst({
    where: { id: attemptId, userId: student.id, quizQuestionIds: { isEmpty: false } },
    include: { lessonNode: { select: { passingPercent: true } } },
  });
  if (!attempt) return NextResponse.json({ error: 'Quiz attempt not found' }, { status: 404 });
  if (attempt.completedAt) {
    return NextResponse.json({ error: 'This quiz was already submitted' }, { status: 409 });
  }

  // Grade only the questions that were picked for this attempt.
  const questions = await getAttemptQuestions(attempt.quizQuestionIds);
  if (!questions) {
    return NextResponse.json(
      { error: 'This quiz was updated by your instructor. Please start it again.' },
      { status: 409 }
    );
  }

  const invalid = validateQuizAnswers(questions, answers);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const result = gradeQuizAttempt(questions, answers, attempt.lessonNode.passingPercent);

  await prisma.$transaction([
    prisma.nodeResponse.createMany({
      data: result.responses.map((response) => ({
        attemptId: attempt.id,
        quizQuestionId: response.questionId,
        studentId: student.id,
        selectedIndices: response.selectedIndices,
        rawAnswer: response.rawAnswer,
        isCorrect: response.isCorrect,
      })),
    }),
    prisma.nodeAttempt.update({
      where: { id: attempt.id },
      data: { completedAt: new Date(), score: result.score, isPassing: result.isPassing },
    }),
  ]);

  return NextResponse.json({ score: result.score, isPassing: result.isPassing });
}
