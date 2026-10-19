import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { requireStudent, isAdmin } from '@/lib/auth/server';
import styles from './layout.module.css';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudent();

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>Spark 26</span>
          <span className={styles.brandSub}>Student</span>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>

        <ul className={styles.navList}>
          <li>
            <Link href="/student" className={styles.navItem}>
              My Courses
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
