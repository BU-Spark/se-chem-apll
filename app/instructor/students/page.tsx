import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function StudentsPage() {
  const courses = await prisma.course.findMany({
    include: {
      enrollments: {
        include: { student: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const uniqueStudentIds = new Set(courses.flatMap((c) => c.enrollments.map((e) => e.studentId)));

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Students</h1>
          <p className={styles.subtitle}>
            {uniqueStudentIds.size} enrolled student
            {uniqueStudentIds.size !== 1 ? 's' : ''} across {courses.length} course
            {courses.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No courses yet</p>
          <p className={styles.emptyDesc}>
            <Link href="/instructor/courses/new" className={styles.emptyLink}>
              Create a course
            </Link>{' '}
            first, then enroll students.
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {courses.map((course) => (
            <li key={course.id} className={styles.card}>
              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{course.title}</p>
                <p className={styles.cardMeta}>
                  {course.code}
                  {course.section ? ` · Section ${course.section}` : ''} &middot; {course.enrollments.length} student
                  {course.enrollments.length !== 1 ? 's' : ''}
                </p>
                {course.enrollments.length > 0 && (
                  <div className={styles.studentChips}>
                    {course.enrollments.slice(0, 5).map((e) => (
                      <span key={e.id} className={styles.chip}>
                        {e.student.name ?? e.student.email}
                      </span>
                    ))}
                    {course.enrollments.length > 5 && (
                      <span className={styles.chipMore}>+{course.enrollments.length - 5} more</span>
                    )}
                  </div>
                )}
              </div>
              <Link href={`/instructor/courses/${course.id}/students`} className={styles.manageLink}>
                Manage
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
