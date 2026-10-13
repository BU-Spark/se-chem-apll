import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { requireInstructor, isAdmin } from '@/lib/auth/server';
import styles from './layout.module.css';

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireInstructor();

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>Spark 26</span>
          <span className={styles.brandSub}>Instructor</span>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>

        <ul className={styles.navList}>
          <li>
            <Link href="/instructor/nodes" className={styles.navItem}>
              Nodes
            </Link>
          </li>
          <li>
            <Link href="/instructor/lessons" className={styles.navItem}>
              Lessons
            </Link>
          </li>
          <li>
            <Link href="/instructor/courses" className={styles.navItem}>
              Courses
            </Link>
          </li>
          <li>
            <Link href="/instructor/students" className={styles.navItem}>
              Students
            </Link>
          </li>
          {isAdmin(user) && (
            <li>
              <Link href="/admin" className={styles.navItem}>
                Administration
              </Link>
            </li>
          )}
          <li>
            <Link href="/debug-role" className={styles.navItem}>
              Switch role
            </Link>
          </li>
        </ul>
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
