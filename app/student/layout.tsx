import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import StudentBottomNav from '@/app/components/StudentBottomNav/StudentBottomNav';
import PageBackground from '@/app/components/PageBackground/PageBackground';
import styles from './layout.module.css';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const role = user?.unsafeMetadata?.role as string | undefined;
  if (role === 'instructor') redirect('/instructor');

  return (
    <div className={styles.shell}>
      <PageBackground />
      <main className={styles.main}>{children}</main>
      <StudentBottomNav />
    </div>
  );
}
