import { redirect } from 'next/navigation';
import { getOrCreateStudent } from '@/lib/getOrCreateStudent';
import { getEnrolledCourses } from '@/lib/studentCourses';
import { ROUTES } from '@/app/routes';
import CourseCard from '@/app/components/CourseCard/CourseCard';
import CourseInviteCard from '@/app/components/CourseInviteCard/CourseInviteCard';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

// Mock progress until the new student flow defines how course progress is calculated.
function mockProgressPercent(courseIndex: number) {
  return courseIndex === 0 ? 98 : 0;
}

export default async function StudentHomePage() {
  const student = await getOrCreateStudent();
  if (!student) redirect(ROUTES.signIn);

  const courses = await getEnrolledCourses(student.id);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Welcome Student</h1>
        <p className={styles.subtitle}>My courses</p>
      </header>

      {courses.length === 0 && <p className={styles.empty}>You&rsquo;re not enrolled in any courses yet.</p>}

      <ul className={styles.cards}>
        {courses.map((course, index) => (
          <li key={course.id}>
            <CourseCard
              title={course.title}
              description={course.description}
              percent={mockProgressPercent(index)}
              href={ROUTES.comingSoon}
            />
          </li>
        ))}
        {/* Placeholder until course invitations exist in the backend. */}
        <li>
          <CourseInviteCard
            courseTitle="Chemistry 101"
            section="Section A"
            professor="Professor Jane Smith"
            joinHref={ROUTES.comingSoon}
          />
        </li>
      </ul>
    </div>
  );
}
