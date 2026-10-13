import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from '../../components/InstructorGrid/grid.module.css';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import LessonsGrid from './LessonsGrid';
import { readLessonFilters, type SearchParams } from './listFilters';

export const dynamic = 'force-dynamic';

export default async function LessonsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const filters = readLessonFilters((await searchParams) ?? {});
  const [lessons, courses] = await Promise.all([
    prisma.lesson.findMany({
      where: { OR: [{ createdByClerkId: userId }, { createdByClerkId: null }] },
      select: {
        id: true,
        title: true,
        summary: true,
        isDraft: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { lessonNodes: true } },
        courseLessons: {
          where: { course: { createdByClerkId: userId } },
          select: { course: { select: { id: true, title: true } } },
        },
      },
      orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.course.findMany({
      where: { createdByClerkId: userId },
      select: { id: true, title: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Lessons</h1>
        <Link href="/instructor/lessons/new" className={styles.createButton}>
          + New lesson
        </Link>
      </div>
      <LessonsGrid lessons={lessons} courses={courses} initialFilters={filters} />
    </div>
  );
}
