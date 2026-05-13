import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import PreQuizForm from './PreQuizForm';

interface RouteContext {
  params: Promise<{ lessonNodeId: string }>;
}

export default async function StudentPreQuizPage({ params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) redirect('/sign-in');
  const normalizedEmail = email.toLowerCase();

  const student = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!student) redirect('/student');

  const { lessonNodeId } = await params;
  const lessonNode = await prisma.lessonNode.findUnique({
    where: { id: lessonNodeId },
    include: {
      lesson: true,
      node: {
        include: {
          questions: {
            where: { isPreLecture: true },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              prompt: true,
              options: true,
            },
          },
        },
      },
    },
  });

  if (!lessonNode) redirect('/student');

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      studentId_courseId: {
        studentId: student.id,
        courseId: lessonNode.lesson.courseId,
      },
    },
  });
  if (!enrollment) redirect('/student');

  return (
    <PreQuizForm
      lessonNodeId={lessonNode.id}
      lessonTitle={lessonNode.lesson.title}
      nodeTitle={lessonNode.node.title}
      questions={lessonNode.node.questions}
    />
  );
}
