import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentStudent } from '@/lib/currentStudent';
import { getAttemptQuestions, isQuizAttempt } from '@/lib/attemptQuestions';
import { toStudentQuizQuestion } from '@/app/utils/studentQuizQuestion';
import QuizPlayer from './QuizPlayer';
import QuizResult from './QuizResult';
import styles from '../../quiz.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function QuizAttemptPage({ params }: PageProps) {
  const student = await getCurrentStudent();
  if (!student) redirect('/student');

  const { attemptId } = await params;

  // Only the student who owns the attempt can open it.
  const attempt = await prisma.nodeAttempt.findFirst({
    where: { id: attemptId, userId: student.id, ...isQuizAttempt },
    include: { lessonNode: { select: { id: true, passingPercent: true, node: { select: { title: true } } } } },
  });
  if (!attempt) notFound();

  const title = `${attempt.lessonNode.node.title} Assessment`;

  // A submitted attempt shows its saved result (also after a refresh).
  if (attempt.completedAt) {
    const correctCount = await prisma.nodeResponse.count({ where: { attemptId: attempt.id, isCorrect: true } });

    return (
      <QuizResult
        title={title}
        isPassing={attempt.isPassing === true}
        score={attempt.score ?? 0}
        correctCount={correctCount}
        totalQuestions={attempt.quizQuestionIds.length}
        passingPercent={attempt.lessonNode.passingPercent}
        retryHref={`/student/quiz/${attempt.lessonNode.id}`}
      />
    );
  }

  // Correct answers never leave the server.
  const bank = await getAttemptQuestions(attempt.quizQuestionIds);
  const questions = (bank ?? []).flatMap((question) => toStudentQuizQuestion(question) ?? []);

  if (!bank || questions.length !== bank.length) {
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

  return <QuizPlayer attemptId={attempt.id} title={title} questions={questions} />;
}
