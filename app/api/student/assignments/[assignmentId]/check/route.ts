import { NextResponse } from 'next/server';
import { apiAccess } from '@/lib/auth/api';
import { prisma } from '@/lib/prisma';
import { gradeAnswer, type AnswerInput } from '@/lib/submissions/grading';
import type { AttemptSnapshot } from '@/lib/submissions/service';

type Context = { params: Promise<{ assignmentId: string }> };

/**
 * Checks one answer of the student's unfinished video-lesson (checkpoint) attempt, so the video
 * can say "Correct" or "Incorrect" right away. Read-only: nothing is saved here; the whole
 * attempt is still graded and saved by the assignment route's "finish" action.
 */
export async function POST(request: Request, { params }: Context) {
  const { user: student, error } = await apiAccess('student');
  if (error) return error;

  const body = await request.json().catch(() => null);
  const answer = body?.answer as AnswerInput | undefined;
  if (typeof body?.attemptId !== 'string' || typeof answer?.questionId !== 'string') {
    return NextResponse.json({ error: 'attemptId and answer.questionId are required.' }, { status: 400 });
  }

  const attempt = await prisma.nodeAttempt.findFirst({
    where: {
      id: body.attemptId,
      userId: student.id,
      courseLessonId: (await params).assignmentId,
      kind: 'CHECKPOINT',
      completedAt: null,
    },
    select: { snapshot: true },
  });
  if (!attempt) return NextResponse.json({ error: 'Attempt not found.' }, { status: 404 });

  const question = (attempt.snapshot as unknown as AttemptSnapshot).questions.find((q) => q.id === answer.questionId);
  if (!question) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });

  try {
    return NextResponse.json({ correct: gradeAnswer(question, answer) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
