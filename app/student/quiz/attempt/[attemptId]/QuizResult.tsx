import Link from 'next/link';
import styles from '../../quiz.module.css';

interface QuizResultProps {
  title: string;
  isPassing: boolean;
  score: number;
  correctCount: number;
  totalQuestions: number;
  passingPercent: number;
  retryHref: string;
}

export default function QuizResult({
  title,
  isPassing,
  score,
  correctCount,
  totalQuestions,
  passingPercent,
  retryHref,
}: QuizResultProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>{title}</p>
        <h1 className={styles.introTitle}>{isPassing ? 'Passed' : 'Not passed yet'}</h1>
        <p className={styles.resultScore}>{Math.round(score)}%</p>
        <p className={styles.introText}>
          {correctCount} of {totalQuestions} correct · {passingPercent}% needed to pass
        </p>
        <div className={styles.actions}>
          <Link href="/student" className={styles.secondaryButton}>
            Back to My Courses
          </Link>
          {!isPassing && (
            <Link href={retryHref} className={styles.primaryButton}>
              Try again
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
