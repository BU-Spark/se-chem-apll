import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStudent } from '@/lib/auth/server';
import { getStudentLessonRoadmap } from '@/lib/studentLessonRoadmap';
import { ROUTES } from '@/app/routes';
import LessonRoadmap from '@/app/components/LessonRoadmap/LessonRoadmap';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function StudentLessonPage({ params }: PageProps) {
  const student = await requireStudent();

  const { courseId, lessonId } = await params;
  const roadmap = await getStudentLessonRoadmap(student.id, courseId, lessonId);
  // Not enrolled, or a draft, hidden, or unknown lesson: show the standard not-found page.
  if (!roadmap) notFound();

  return (
    <div className={styles.page}>
      <Link href={ROUTES.studentCourse(courseId)} className={styles.back} aria-label={`Back to ${roadmap.courseTitle}`}>
        ‹
      </Link>
      <header className={styles.header}>
        <h1 className={styles.title}>{roadmap.lessonTitle}</h1>
        <p className={styles.course}>{roadmap.courseTitle}</p>
      </header>

      {roadmap.nodes.length === 0 ? (
        <p className={styles.empty}>This lesson has no nodes yet.</p>
      ) : (
        <div className={styles.scroller}>
          <LessonRoadmap
            nodes={roadmap.nodes}
            edges={roadmap.edges}
            nodeHref={(nodeId) => ROUTES.studentNode(courseId, lessonId, nodeId)}
          />
        </div>
      )}
    </div>
  );
}
