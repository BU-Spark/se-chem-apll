import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import styles from './layout.module.css';

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const role = user?.unsafeMetadata?.role as string | undefined;
  if (role === 'student') redirect('/student');

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
        </ul>

        <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <Link
            href="/debug-role"
            style={{
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.5)',
              textDecoration: 'none',
              display: 'block',
            }}
          >
            Debug Role
          </Link>
        </div>
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
