import Link from 'next/link';
import type { LessonStatus } from '@prisma/client';
import { PROGRESS_LABELS } from '@/app/utils/progressStatus';
import a11y from '@/app/styles/a11y.module.css';
import styles from './LessonCard.module.css';

interface LessonCardProps {
  number: number;
  title: string;
  status: LessonStatus;
  isCurrent: boolean;
  href: string;
}

// One lesson in a course: a card with a tooltip (title and status) shown when current or hovered.
export default function LessonCard({ number, title, status, isCurrent, href }: LessonCardProps) {
  const name = `Lesson ${number}: ${title}`;
  const statusLabel = PROGRESS_LABELS[status];

  return (
    <Link
      href={href}
      className={isCurrent ? `${styles.card} ${styles.current}` : styles.card}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <span className={a11y.srOnly}>
        {name}, {statusLabel}
      </span>
      {status === 'COMPLETED' && (
        <span className={styles.check} aria-hidden="true">
          ✓
        </span>
      )}
      <span className={styles.tooltip} aria-hidden="true">
        <span className={styles.tooltipTitle}>{name}</span>
        <span className={styles.tooltipStatus}>{statusLabel}</span>
      </span>
    </Link>
  );
}
