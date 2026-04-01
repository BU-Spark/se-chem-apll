import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function LessonsPage() {
  const lessons = await prisma.lesson.findMany({
    include: {
      course: true,
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
                  {lesson.course.code} &middot; {lesson.lessonNodes.length} node
                  {lesson.lessonNodes.length !== 1 ? 's' : ''}
                  {lesson.dueDate && ` · Due ${new Date(lesson.dueDate).toLocaleDateString()}`}
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
