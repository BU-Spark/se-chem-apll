import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import styles from './layout.module.css';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const role = user?.unsafeMetadata?.role as string | undefined;
  if (role === 'instructor') redirect('/instructor');

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
        </ul>
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
