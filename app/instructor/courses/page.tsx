import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from '../../components/InstructorGrid/grid.module.css';
import { requireInstructor } from '@/lib/auth/server';
import CoursesGrid from './CoursesGrid';
import { readCourseFilters, type SearchParams } from './listFilters';

export const dynamic = 'force-dynamic';

export default async function CoursesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireInstructor();
  const filters = readCourseFilters((await searchParams) ?? {});
  const courses = await prisma.course.findMany({
    where: {},
    select: {
      createdByClerkId: true,
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
      <p>
        <Link href="/instructor/copy?mode=course">Duplicate a course</Link>
      </p>
      <CoursesGrid
        courses={courses.map((item) => ({
          ...item,
          canEdit:
            user.platformRole === 'ADMIN' ||
            item.createdByClerkId === null ||
            item.createdByClerkId === user.clerkUserId,
        }))}
        initialFilters={filters}
      />
    </div>
  );
}
