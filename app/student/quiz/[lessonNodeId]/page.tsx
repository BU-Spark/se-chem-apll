import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { effectiveQuizQuestionCount } from '@/app/utils/quizQuestionCount';
import StartQuizButton from './StartQuizButton';
import styles from '../quiz.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ lessonNodeId: string }>;
}

// Intro screen shown before a quiz attempt is created.
export default async function QuizIntroPage({ params }: PageProps) {
  const { lessonNodeId } = await params;

  const lessonNode = await prisma.lessonNode.findFirst({
    where: { id: lessonNodeId, lesson: { isDraft: false }, node: { isDraft: false } },
    include: {
      lesson: { select: { title: true } },
      node: { select: { title: true, _count: { select: { quizQuestions: true } } } },
    },
  });
  if (!lessonNode) notFound();

  const questionCount = effectiveQuizQuestionCount(lessonNode.quizQuestionCount, lessonNode.node._count.quizQuestions);

  return (
    <div className={styles.screen}>
      <Link href="/student" className={styles.close} aria-label="Close">
        ✕
      </Link>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>{lessonNode.lesson.title}</p>
        <h1 className={styles.introTitle}>{lessonNode.node.title}</h1>
        {questionCount > 0 ? (
          <p className={styles.introText}>
            {questionCount} question{questionCount !== 1 ? 's' : ''} · {lessonNode.passingPercent}% needed to pass
          </p>
        ) : (
          <p className={styles.introText}>There is no quiz for this node yet.</p>
        )}
        <div className={styles.actions}>
          <Link href="/student" className={styles.secondaryButton}>
            Back
          </Link>
          {questionCount > 0 && <StartQuizButton lessonNodeId={lessonNode.id} />}
        </div>
      </div>
    </div>
  );
}
