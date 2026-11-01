import Link from 'next/link';
import { isAdmin, requireStudent } from '@/lib/auth/server';
import { ROUTES } from '@/app/routes';
import CenteredPage from '@/app/components/CenteredPage/CenteredPage';
import InfoCard from '@/app/components/InfoCard/InfoCard';
import InfoField from '@/app/components/InfoCard/InfoField';
import AccountActions from '@/app/components/AccountActions/AccountActions';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function StudentSettingsPage() {
  const student = await requireStudent();

  return (
    <CenteredPage title="Settings">
      {/* Read-only: students can't change their display name. */}
      <InfoCard label="Account">
        <InfoField label="Display name" lines={[student.name ?? '—']} />
      </InfoCard>
      <AccountActions />
      <nav className={styles.links} aria-label="More settings">
        <Link href={ROUTES.switchRole}>Switch role</Link>
        {isAdmin(student) && <Link href={ROUTES.admin}>Administration</Link>}
      </nav>
    </CenteredPage>
  );
}
