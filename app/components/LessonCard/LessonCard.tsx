import Link from 'next/link';
import type { LessonStatus } from '@prisma/client';
import { AVAILABILITY_LABELS, PROGRESS_LABELS, type LessonAvailability } from '@/app/utils/progressStatus';
import LessonSubmissionSummary from '@/app/components/LessonSubmissionSummary/LessonSubmissionSummary';
import type { StudentLessonSubmission } from '@/lib/studentLessonSubmission';
import styles from './LessonCard.module.css';

interface LessonCardProps {
  number: number;
  title: string;
  status: LessonStatus;
  // Not open yet or closed adds that to the status, e.g. "Not started · Closed".
  availability?: LessonAvailability;
  isCurrent: boolean;
  href: string;
  submission: StudentLessonSubmission;
  // Updated nodes to redo, or finished work not yet handed in.
  needsAttention?: boolean;
}

export default function LessonCard({
  number,
  title,
  status,
  availability = 'OPEN',
  isCurrent,
  href,
  submission,
  needsAttention,
}: LessonCardProps) {
  const name = `Lesson ${number}: ${title}`;
  const statusLabel =
    availability === 'OPEN'
      ? PROGRESS_LABELS[status]
      : `${PROGRESS_LABELS[status]} · ${AVAILABILITY_LABELS[availability]}`;

  return (
    <Link
      href={href}
      className={isCurrent ? `${styles.card} ${styles.current}` : styles.card}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <span className={styles.title}>{name}</span>
      <span className={styles.progress}>
        {status === 'COMPLETED' && <span aria-hidden="true">✓ </span>}
        {needsAttention && availability === 'OPEN' ? 'Updated or unfinished work' : statusLabel}
      </span>
      <LessonSubmissionSummary submission={submission} />
    </Link>
  );
}
