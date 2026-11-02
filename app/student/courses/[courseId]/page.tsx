import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStudent } from '@/lib/auth/server';
import { findCurrentLesson, getStudentCourse } from '@/lib/studentCourses';
import { ROUTES } from '@/app/routes';
import LessonCard from '@/app/components/LessonCard/LessonCard';
import buttons from '@/app/styles/buttons.module.css';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export default async function StudentCoursePage({ params }: PageProps) {
  const student = await requireStudent();

  const { courseId } = await params;
  const course = await getStudentCourse(student.id, courseId);
  // Not enrolled (or no such course): show the standard not-found page.
  if (!course) notFound();

  const currentLesson = findCurrentLesson(course.lessons);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{course.title}</h1>
        {course.description && <p className={styles.description}>{course.description}</p>}
        {currentLesson && (
          <Link href={ROUTES.studentLesson(course.id, currentLesson.id)} className={buttons.primary}>
            Take me to current lesson
          </Link>
        )}
      </header>

      {course.lessons.length === 0 ? (
        <p className={styles.empty}>No lessons yet.</p>
      ) : (
        <nav className={styles.lessons} aria-label="Lessons">
          {course.lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              number={lesson.number}
              title={lesson.title}
              status={lesson.status}
              isCurrent={lesson.id === currentLesson?.id}
              href={ROUTES.studentLesson(course.id, lesson.id)}
            />
          ))}
        </nav>
      )}
    </div>
  );
}
