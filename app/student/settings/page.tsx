import { redirect } from 'next/navigation';
import { getOrCreateStudent } from '@/lib/getOrCreateStudent';
import { ROUTES } from '@/app/routes';
import CenteredPage from '@/app/components/CenteredPage/CenteredPage';
import InfoCard from '@/app/components/InfoCard/InfoCard';
import InfoField from '@/app/components/InfoCard/InfoField';
import AccountActions from '@/app/components/AccountActions/AccountActions';

export const dynamic = 'force-dynamic';

export default async function StudentSettingsPage() {
  const student = await getOrCreateStudent();
  if (!student) redirect(ROUTES.signIn);

  return (
    <CenteredPage title="Settings">
      {/* Read-only: students can't change their display name. */}
      <InfoCard label="Account">
        <InfoField label="Display name" lines={[student.name ?? '—']} />
      </InfoCard>
      <AccountActions />
    </CenteredPage>
  );
}
