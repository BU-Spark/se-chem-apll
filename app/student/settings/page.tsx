import Link from 'next/link';
import { isAdmin } from '@/lib/auth/policy';
import buttons from '@/app/styles/buttons.module.css';
import styles from './page.module.css';
import { requireStudent } from '@/lib/auth/server';
import CenteredPage from '@/app/components/CenteredPage/CenteredPage';
import InfoCard from '@/app/components/InfoCard/InfoCard';
import InfoField from '@/app/components/InfoCard/InfoField';
import AccountActions from '@/app/components/AccountActions/AccountActions';

export const dynamic = 'force-dynamic';

export default async function StudentSettingsPage() {
  const student = await requireStudent();

  return (
    <CenteredPage title="Settings">
      {/* Read-only: students can't change their display name. */}
      <InfoCard label="Account">
        <InfoField label="Display name" lines={[student.name ?? '—']} />
      </InfoCard>
      <nav className={styles.links} aria-label="Account navigation">
        {isAdmin(student) && (
          <Link href="/admin" className={buttons.secondary}>
            Administration
          </Link>
        )}
        <Link href="/debug-role" className={buttons.secondary}>
          Switch role
        </Link>
      </nav>
      <AccountActions />
    </CenteredPage>
  );
}
