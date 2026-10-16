import Link from 'next/link';
import buttons from '@/app/styles/buttons.module.css';
import styles from './CourseInviteCard.module.css';

interface CourseInviteCardProps {
  courseTitle: string;
  section: string;
  professor: string;
  joinHref: string;
}

export default function CourseInviteCard({ courseTitle, section, professor, joinHref }: CourseInviteCardProps) {
  return (
    <div className={styles.card}>
      <p className={styles.text}>You&rsquo;ve been invited to join:</p>
      <p className={styles.course}>
        {courseTitle}
        <br />
        {section}
        <br />
        {professor}
      </p>
      <Link href={joinHref} className={buttons.primary}>
        Join
      </Link>
    </div>
  );
}
