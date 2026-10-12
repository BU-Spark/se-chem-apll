import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { pickRandomQuizQuestions } from '@/app/utils/quizQuestionCount';

interface RouteContext {
  params: Promise<{ lessonNodeId: string }>;
}

// POST /api/student/quiz/[lessonNodeId]/start — begin a quiz attempt
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const student = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const { lessonNodeId } = await params;

  // Draft lessons and nodes are hidden from students, so treat them as not found.
  const lessonNode = await prisma.lessonNode.findFirst({
    where: { id: lessonNodeId, lesson: { isDraft: false }, node: { isDraft: false } },
    include: { node: { select: { quizQuestions: { select: { id: true } } } } },
  });
  if (!lessonNode) return NextResponse.json({ error: 'Lesson node not found' }, { status: 404 });

  // Each lesson's quiz belongs to one course, which holds its open/due dates.
  const courseLesson = await prisma.courseLesson.findFirst({
    where: {
      lessonId: lessonNode.lessonId,
      course: { enrollments: { some: { studentId: student.id } } },
    },
  });
  if (!courseLesson) {
    return NextResponse.json({ error: 'You are not enrolled in a course with this lesson' }, { status: 403 });
  }

  const now = new Date();
  const notOpenYet = courseLesson.openDate !== null && now < courseLesson.openDate;
  const closed = courseLesson.dueDate !== null && now > courseLesson.dueDate && !courseLesson.accessibleAfterDue;
  if (notOpenYet || closed) {
    return NextResponse.json({ error: 'This lesson is not open right now' }, { status: 403 });
  }

  // Empty bank or a quizQuestionCount of 0 both mean there is no quiz to take.
  const picked = pickRandomQuizQuestions(lessonNode.node.quizQuestions, lessonNode.quizQuestionCount);
  if (picked.length === 0) {
    return NextResponse.json({ error: 'No quiz is configured for this node' }, { status: 422 });
  }

  const attempt = await prisma.nodeAttempt.create({
    data: { lessonNodeId, userId: student.id, quizQuestionIds: picked.map((question) => question.id) },
  });

  return NextResponse.json({ attemptId: attempt.id }, { status: 201 });
}
