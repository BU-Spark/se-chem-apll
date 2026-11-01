import Link from 'next/link';
import styles from './CourseTabs.module.css';

export default function CourseTabs({
  courseId,
  active,
}: {
  courseId: string;
  active: 'edit' | 'students' | 'gradebook';
}) {
  return (
    <nav className={styles.tabs} aria-label="Course navigation">
      {(
        [
          ['edit', 'Details'],
          ['students', 'Students'],
          ['gradebook', 'Gradebook'],
        ] as const
      ).map(([path, label]) => (
        <Link
          key={path}
          href={`/instructor/courses/${courseId}/${path}`}
          aria-current={active === path ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
