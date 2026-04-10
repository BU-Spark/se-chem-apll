import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import styles from './layout.module.css';

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>Spark 26</span>
          <span className={styles.brandSub}>Instructor</span>
          <UserButton afterSignOutUrl="/" />
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
        </ul>

        <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid #e5e7eb' }}>
          <Link
            href="/debug-role"
            style={{
              fontSize: '0.75rem',
              color: '#9ca3af',
              textDecoration: 'none',
              display: 'block',
            }}
          >
            🔧 Debug Role
          </Link>
        </div>
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
