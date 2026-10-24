import { requireStudent } from '@/lib/auth/server';
import StudentBottomNav from '@/app/components/StudentBottomNav/StudentBottomNav';
import PageBackground from '@/app/components/PageBackground/PageBackground';
import styles from './layout.module.css';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireStudent();

  return (
    <div className={styles.shell}>
      <PageBackground />
      <main className={styles.main}>{children}</main>
      <StudentBottomNav />
    </div>
  );
}
