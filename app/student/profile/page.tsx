import { requireStudent } from '@/lib/auth/server';
import { getStudentInstructors } from '@/lib/studentCourses';
import CenteredPage from '@/app/components/CenteredPage/CenteredPage';
import InfoCard from '@/app/components/InfoCard/InfoCard';
import InfoField from '@/app/components/InfoCard/InfoField';

export const dynamic = 'force-dynamic';

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
          <InfoField
            label="Course"
            lines={[
              `${instructor.course.code}${instructor.course.section ? ` · ${instructor.course.section}` : ''} — ${instructor.course.title}`,
            ]}
            fullWidth
          />
          <InfoField label="Instructor" lines={[instructor.name]} />
          <InfoField label="Email" lines={[instructor.email]} />
          {instructor.officeHours?.trim() && (
            <InfoField
              label="Office Hours"
              lines={instructor.officeHours
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)}
              fullWidth
            />
          )}
        </InfoCard>
      ))}
    </CenteredPage>
  );
}
