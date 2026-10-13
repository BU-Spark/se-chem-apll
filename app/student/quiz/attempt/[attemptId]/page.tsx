import Link from 'next/link';
import { auth, currentUser } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { toStudentQuizQuestion, type StudentQuizQuestion } from '@/app/utils/studentQuizQuestion';
import QuizPlayer from './QuizPlayer';
import styles from '../../quiz.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function QuizAttemptPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) redirect('/sign-in');

  const student = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!student) redirect('/student');

  const { attemptId } = await params;

  // Only the student who owns the attempt can open it.
  const attempt = await prisma.nodeAttempt.findFirst({
    where: { id: attemptId, userId: student.id, quizQuestionIds: { isEmpty: false } },
    include: { lessonNode: { select: { node: { select: { title: true } } } } },
  });
  if (!attempt) notFound();
  if (attempt.completedAt) redirect('/student');

  const bank = await prisma.quizQuestion.findMany({
    where: { id: { in: attempt.quizQuestionIds } },
    select: { id: true, prompt: true, options: true, correctIndices: true },
  });
  const byId = new Map(bank.map((question) => [question.id, question]));

  // Keep the order the questions were picked in; correct answers never leave the server.
  const questions = attempt.quizQuestionIds.flatMap((id): StudentQuizQuestion[] => {
    const question = byId.get(id);
    const studentQuestion = question ? toStudentQuizQuestion(question) : null;
    return studentQuestion ? [studentQuestion] : [];
  });

  if (questions.length !== attempt.quizQuestionIds.length) {
    return (
      <div className={styles.screen}>
        <div className={styles.intro}>
          <p className={styles.introText}>This quiz was updated by your instructor. Please start it again.</p>
          <Link href="/student" className={styles.secondaryButton}>
            Back to My Courses
          </Link>
        </div>
      </div>
    );
  }

  return <QuizPlayer title={`${attempt.lessonNode.node.title} Assessment`} questions={questions} />;
}
