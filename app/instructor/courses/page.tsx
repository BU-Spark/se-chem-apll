import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from './page.module.css';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CoursesPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  // OR is so the seed data is included
  const courses = await prisma.course.findMany({
    where: {
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: {
      courseLessons: true,
      enrollments: true,
      contacts: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Courses</h1>
        <Link href="/instructor/courses/new" className={styles.createButton}>
          + New course
        </Link>
      </div>

      {courses.length === 0 ? (
        <p className={styles.empty}>No courses yet. Create your first one above.</p>
      ) : (
        <ul className={styles.list}>
          {courses.map((course) => (
            <li key={course.id} className={styles.card}>
              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{course.title}</p>
                {course.description && <p className={styles.cardDescription}>{course.description}</p>}
                <p className={styles.cardMeta}>
                  {course.code}
                  {course.section && ` · Section ${course.section}`} · {course.courseLessons.length} lesson
                  {course.courseLessons.length !== 1 ? 's' : ''} · {course.enrollments.length} student
                  {course.enrollments.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className={styles.cardActions}>
                <Link href={`/instructor/courses/${course.id}/students`} className={styles.studentsLink}>
                  Students
                </Link>
                <Link href={`/instructor/courses/${course.id}/edit`} className={styles.editLink}>
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
