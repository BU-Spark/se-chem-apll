import { prisma } from '@/lib/prisma';
import styles from './page.module.css';
import { requireInstructor, contentScope } from '@/lib/auth/server';
import StudentsGrid from './StudentsGrid';
import { readStudentFilters, uniqueStudentCount, type SearchParams } from './listFilters';

export const dynamic = 'force-dynamic';
export default async function StudentsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireInstructor();
  const filters = readStudentFilters((await searchParams) ?? {});
  const courses = await prisma.course.findMany({
    where: { ...contentScope(user) },
    select: {
      id: true,
      title: true,
      code: true,
      section: true,
      enrollments: {
        where: { role: 'STUDENT' },
        select: { student: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
  });
  const count = uniqueStudentCount(courses);
  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Students</h1>
          <p className={styles.subtitle}>
            {count} enrolled student{count !== 1 ? 's' : ''} across {courses.length} course
            {courses.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <StudentsGrid courses={courses} initialFilters={filters} />
    </div>
  );
}
