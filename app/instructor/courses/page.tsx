import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from '../../components/InstructorGrid/grid.module.css';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import CoursesGrid from './CoursesGrid';
import { readCourseFilters, type SearchParams } from './listFilters';

export const dynamic = 'force-dynamic';

export default async function CoursesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const filters = readCourseFilters((await searchParams) ?? {});
  const courses = await prisma.course.findMany({
    where: { OR: [{ createdByClerkId: userId }, { createdByClerkId: null }] },
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
