import Link from 'next/link';
import ProgressRing from '@/app/components/ProgressRing/ProgressRing';
import { PROGRESS_LABELS, statusFromPercent } from '@/app/utils/progressStatus';
import styles from './CourseCard.module.css';

interface CourseCardProps {
  title: string;
  description: string | null;
  percent: number;
  href: string;
}

export default function CourseCard({ title, description, percent, href }: CourseCardProps) {
  return (
    <Link href={href} className={styles.card}>
      <div className={styles.image} />
      <ProgressRing percent={percent} className={styles.ring} />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.description}>{description}</p>}
        <p className={styles.status}>{PROGRESS_LABELS[statusFromPercent(percent)]}</p>
      </div>
    </Link>
  );
}
