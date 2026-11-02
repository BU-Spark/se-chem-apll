import { NextResponse } from 'next/server';
import { apiAccess } from '@/lib/auth/api';
import { prisma } from '@/lib/prisma';
import { gradeAnswer, type AnswerInput } from '@/lib/submissions/grading';
import type { AttemptSnapshot } from '@/lib/submissions/service';
import { asStudent } from '@/lib/studentCourses';

type Context = { params: Promise<{ assignmentId: string }> };

// Questions have at most 8 choices; numeric answers are short.
const MAX_CHOICES = 8;
const MAX_ANSWER_LENGTH = 100;

// The answer's shape: a question id plus chosen indices, a typed number, or "I'm Not Sure".
function isAnswerInput(answer: unknown): answer is AnswerInput {
  const { questionId, selectedIndices, rawAnswer, notSure } = (answer ?? {}) as Record<string, unknown>;
  return (
    typeof questionId === 'string' &&
    (selectedIndices === undefined || (Array.isArray(selectedIndices) && selectedIndices.length <= MAX_CHOICES)) &&
    (rawAnswer === undefined || (typeof rawAnswer === 'string' && rawAnswer.length <= MAX_ANSWER_LENGTH)) &&
    (notSure === undefined || typeof notSure === 'boolean')
  );
}

/**
 * Checks one answer of the student's unfinished video-lesson (checkpoint) attempt, so the video
 * can say "Correct" or "Incorrect" right away. Read-only: nothing is saved here; the whole
 * attempt is still graded and saved by the assignment route's "finish" action.
 * Checks aren't limited, so a student could try every choice: fine, because video questions
 * are practice and don't count toward the course grade (quiz attempts can't be checked here).
 */
export async function POST(request: Request, { params }: Context) {
  const { user: student, error } = await apiAccess('student');
  if (error) return error;

  const body = await request.json().catch(() => null);
  const answer = body?.answer;
  if (typeof body?.attemptId !== 'string' || !isAnswerInput(answer)) {
    return NextResponse.json({ error: 'attemptId and a valid answer are required.' }, { status: 400 });
  }

  const attempt = await prisma.nodeAttempt.findFirst({
    where: {
      id: body.attemptId,
      userId: student.id,
      courseLessonId: (await params).assignmentId,
      kind: 'CHECKPOINT',
      completedAt: null,
      // Still enrolled, and the lesson wasn't turned back into a draft.
      progress: {
        courseLesson: { lesson: { isDraft: false }, course: { enrollments: { some: asStudent(student.id) } } },
      },
    },
    select: { snapshot: true },
  });
  if (!attempt) return NextResponse.json({ error: 'Attempt not found.' }, { status: 404 });

  const question = (attempt.snapshot as unknown as AttemptSnapshot).questions.find((q) => q.id === answer.questionId);
  if (!question) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });

  // Grading errors become a 400 with their message, the same as the "finish" action.
  try {
    return NextResponse.json({ correct: gradeAnswer(question, answer) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
