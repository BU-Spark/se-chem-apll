import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { requireAdmin } from '@/lib/auth/server';
import styles from '../instructor/layout.module.css';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>Spark 26</span>
          <span className={styles.brandSub}>Administration</span>
          <UserButton />
        </div>
        <ul className={styles.navList}>
          <li>
            <Link className={styles.navItem} href="/admin">
              Users &amp; roles
            </Link>
          </li>
          <li>
            <Link className={styles.navItem} href="/instructor/courses">
              All courses &amp; gradebooks
            </Link>
          </li>
          <li>
            <Link className={styles.navItem} href="/instructor/lessons">
              All lessons
            </Link>
          </li>
          <li>
            <Link className={styles.navItem} href="/instructor/nodes">
              All nodes
            </Link>
          </li>
          <li>
            <Link className={styles.navItem} href="/instructor/students">
              Enrollments
            </Link>
          </li>
          <li>
            <Link className={styles.navItem} href="/debug-role">
              Switch role
            </Link>
          </li>
        </ul>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
