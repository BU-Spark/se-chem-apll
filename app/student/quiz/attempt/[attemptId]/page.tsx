import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentStudent } from '@/lib/currentStudent';
import { getAttemptQuestions } from '@/lib/attemptQuestions';
import { toStudentQuizQuestion } from '@/app/utils/studentQuizQuestion';
import QuizPlayer from './QuizPlayer';
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
    where: { id: attemptId, userId: student.id, quizQuestionIds: { isEmpty: false } },
    include: { lessonNode: { select: { id: true, passingPercent: true, node: { select: { title: true } } } } },
  });
  if (!attempt) notFound();

  const title = `${attempt.lessonNode.node.title} Assessment`;

  // A submitted attempt shows its saved result (also after a refresh).
  if (attempt.completedAt) {
    const totalQuestions = attempt.quizQuestionIds.length;
    const correctCount = await prisma.nodeResponse.count({ where: { attemptId: attempt.id, isCorrect: true } });

    return (
      <div className={styles.screen}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{title}</p>
          <h1 className={styles.introTitle}>{attempt.isPassing ? 'Passed' : 'Not passed yet'}</h1>
          <p className={styles.resultScore}>{Math.round(attempt.score ?? 0)}%</p>
          <p className={styles.introText}>
            {correctCount} of {totalQuestions} correct · {attempt.lessonNode.passingPercent}% needed to pass
          </p>
          <div className={styles.actions}>
            <Link href="/student" className={styles.secondaryButton}>
              Back to My Courses
            </Link>
            {!attempt.isPassing && (
              <Link href={`/student/quiz/${attempt.lessonNode.id}`} className={styles.primaryButton}>
                Try again
              </Link>
            )}
          </div>
        </div>
      </div>
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
