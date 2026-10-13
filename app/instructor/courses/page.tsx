import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from '../../components/InstructorGrid/grid.module.css';
import { requireInstructor, contentScope } from '@/lib/auth/server';
import CoursesGrid from './CoursesGrid';
import { readCourseFilters, type SearchParams } from './listFilters';

export const dynamic = 'force-dynamic';

export default async function CoursesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireInstructor();
  const filters = readCourseFilters((await searchParams) ?? {});
  const courses = await prisma.course.findMany({
    where: { ...contentScope(user) },
    select: {
      id: true,
      title: true,
      code: true,
      section: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { courseLessons: true, enrollments: { where: { role: 'STUDENT' } } } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Courses</h1>
        <Link href="/instructor/courses/new" className={styles.createButton}>
          + New course
        </Link>
      </div>
      <CoursesGrid courses={courses} initialFilters={filters} />
    </div>
  );
}
