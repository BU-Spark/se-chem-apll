import Link from 'next/link';
import styles from './page.module.css';

export default function InstructorHomePage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Instructor dashboard</h1>
      <p className={styles.subtitle}>Manage your courses, lessons, and nodes.</p>

      <div className={styles.cards}>
        <Link href="/instructor/nodes" className={styles.card}>
          <span className={styles.cardTitle}>Nodes</span>
          <span className={styles.cardDesc}>Create reusable video + question bundles</span>
        </Link>
        <Link href="/instructor/lessons" className={styles.card}>
          <span className={styles.cardTitle}>Lessons</span>
          <span className={styles.cardDesc}>Drag nodes together to build lessons</span>
        </Link>
        <Link href="/instructor/courses" className={styles.card}>
          <span className={styles.cardTitle}>Courses</span>
          <span className={styles.cardDesc}>Organize lessons into courses</span>
        </Link>
      </div>
    </div>
  );
}
