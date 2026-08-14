import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from './page.module.css';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LessonsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }
  const lessons = await prisma.lesson.findMany({
    where: {
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: {
      lessonNodes: { include: { node: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Lessons</h1>
        <Link href="/instructor/lessons/new" className={styles.createButton}>
          + New lesson
        </Link>
      </div>

      {lessons.length === 0 ? (
        <p className={styles.empty}>No lessons yet. Create your first one above.</p>
      ) : (
        <ul className={styles.list}>
          {lessons.map((lesson) => (
            <li key={lesson.id} className={styles.card}>
              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{lesson.title}</p>
                <p className={styles.cardMeta}>
                  {lesson.lessonNodes.length} node{lesson.lessonNodes.length !== 1 ? 's' : ''}
                </p>
                <p className={styles.cardSlug}>/lessons/{lesson.slug}</p>
              </div>
              <Link href={`/instructor/lessons/${lesson.id}/edit`} className={styles.editLink}>
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
