import { requireStudent } from '@/lib/auth/server';
import { getEnrolledCourses } from '@/lib/studentCourses';
import { ROUTES } from '@/app/routes';
import CourseCard from '@/app/components/CourseCard/CourseCard';
import JoinCourseForm from './JoinCourseForm';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function StudentHomePage() {
  const student = await requireStudent();

  const courses = await getEnrolledCourses(student.id);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Welcome Student</h1>
        <p className={styles.subtitle}>My courses</p>
      </header>

      <JoinCourseForm />
      {courses.length === 0 && <p className={styles.empty}>You&rsquo;re not enrolled in any courses yet.</p>}

      <ul className={styles.cards}>
        {courses.map((course) => (
          <li key={course.id}>
            <CourseCard
              title={course.title}
              description={course.description}
              percent={course.progressPercent}
              href={ROUTES.studentCourse(course.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
