import { requireStudent } from '@/lib/auth/server';
import { getStudentInstructors } from '@/lib/studentCourses';
import CenteredPage from '@/app/components/CenteredPage/CenteredPage';
import InfoCard from '@/app/components/InfoCard/InfoCard';
import InfoField from '@/app/components/InfoCard/InfoField';

export const dynamic = 'force-dynamic';

// Mock office hours until instructors can set them.
const MOCK_OFFICE_HOURS = ['Tuesdays & Fridays', 'SCI 201', '2-4PM'];

export default async function StudentProfilePage() {
  const student = await requireStudent();

  const instructors = await getStudentInstructors(student.id);

  return (
    <CenteredPage title="Profile">
      <InfoCard label="Student">
        <InfoField label="Student" lines={[student.name ?? '—']} />
        <InfoField label="Email" lines={[student.email]} />
      </InfoCard>

      {instructors.map((instructor) => (
        <InfoCard key={instructor.id} label={`Instructor ${instructor.name}`}>
          <InfoField label="Instructor" lines={[instructor.name]} />
          <InfoField label="Email" lines={[instructor.email]} />
          <InfoField label="Office Hours" lines={MOCK_OFFICE_HOURS} fullWidth />
        </InfoCard>
      ))}
    </CenteredPage>
  );
}
