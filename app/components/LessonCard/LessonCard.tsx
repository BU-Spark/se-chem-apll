import Link from 'next/link';
import type { LessonStatus } from '@prisma/client';
import { PROGRESS_LABELS } from '@/app/utils/progressStatus';
import LessonSubmissionSummary from '@/app/components/LessonSubmissionSummary/LessonSubmissionSummary';
import type { StudentLessonSubmission } from '@/lib/studentLessonSubmission';
import styles from './LessonCard.module.css';

interface LessonCardProps {
  number: number;
  title: string;
  status: LessonStatus;
  isCurrent: boolean;
  href: string;
  submission: StudentLessonSubmission;
}

export default function LessonCard({ number, title, status, isCurrent, href, submission }: LessonCardProps) {
  return (
    <Link
      href={href}
      className={isCurrent ? `${styles.card} ${styles.current}` : styles.card}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <span className={styles.title}>
        Lesson {number}: {title}
      </span>
      <span className={styles.progress}>
        {status === 'COMPLETED' && <span aria-hidden="true">✓ </span>}
        {PROGRESS_LABELS[status]}
      </span>
      <LessonSubmissionSummary submission={submission} />
    </Link>
  );
}
