import Link from 'next/link';
import { requireStudent } from '@/lib/auth/server';
import { getLessonsToDo } from '@/lib/studentCourses';
import { ROUTES } from '@/app/routes';
import { PROGRESS_LABELS } from '@/app/utils/progressStatus';
import { formatDay } from '@/app/utils/dates';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

// The Lessons tab: every unfinished lesson across the student's courses, due soonest first.
export default async function StudentLessonsPage() {
  const student = await requireStudent();
  const lessons = await getLessonsToDo(student.id);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Lessons</h1>
        <p className={styles.subtitle}>What to do next</p>
      </header>

      {lessons.length === 0 ? (
        <p>You&rsquo;re all caught up!</p>
      ) : (
        <ul className={styles.list}>
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <Link href={ROUTES.studentLesson(lesson.courseId, lesson.id)} className={styles.item}>
                <span className={styles.lessonTitle}>{lesson.title}</span>
                <span>{lesson.courseTitle}</span>
                <span className={styles.details}>
                  {lesson.dueDate ? `Due ${formatDay(lesson.dueDate)}` : 'No due date'} ·{' '}
                  {PROGRESS_LABELS[lesson.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
