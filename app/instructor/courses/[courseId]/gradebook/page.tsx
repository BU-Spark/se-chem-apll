import { auth, currentUser } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import CourseTabs from '@/app/components/CourseTabs';
import Gradebook from './Gradebook';
import type { GradeRow } from './types';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export default async function GradebookPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const user = await currentUser();
  if (user?.unsafeMetadata?.role !== 'instructor') notFound();
  const { courseId } = await params;
  const course = await prisma.course.findFirst({
    where: { id: courseId, OR: [{ createdByClerkId: userId }, { createdByClerkId: null }] },
    select: {
      id: true,
      title: true,
      code: true,
      section: true,
      enrollments: {
        where: { role: 'STUDENT' },
        select: { student: { select: { id: true, name: true, email: true } } },
        orderBy: { studentId: 'asc' },
      },
      courseLessons: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, lesson: { select: { title: true } } },
      },
    },
  });
  if (!course) notFound();
  const lessons = course.courseLessons.map(({ id, lesson }) => ({ id, title: lesson.title || 'Untitled lesson' }));
  const progress =
    course.enrollments.length && lessons.length
      ? await prisma.courseLessonProgress.findMany({
          where: {
            studentId: { in: course.enrollments.map(({ student }) => student.id) },
            courseLessonId: { in: lessons.map((lesson) => lesson.id) },
          },
          select: {
            studentId: true,
            courseLessonId: true,
            status: true,
            percentComplete: true,
            submissions: {
              orderBy: [{ finalPercent: { sort: 'desc', nulls: 'last' } }, { submittedAt: 'asc' }, { number: 'asc' }],
              take: 1,
            },
          },
        })
      : [];
  const byStudent = new Map<string, GradeRow['grades']>();
  for (const item of progress) {
    if (!byStudent.has(item.studentId)) byStudent.set(item.studentId, {});
    byStudent.get(item.studentId)![item.courseLessonId] = {
      status: item.status,
      percentComplete: item.percentComplete,
      best: JSON.parse(JSON.stringify(item.submissions[0] ?? null)),
    };
  }
  const rows = course.enrollments.map(({ student }) => ({
    id: student.id,
    name: student.name?.trim() || student.email,
    email: student.email,
    grades: byStudent.get(student.id) ?? {},
  }));
  return (
    <div>
      <header className={styles.header}>
        <h1>{course.title || 'Untitled course'}</h1>
        <p>
          {course.code}
          {course.section ? ` · Section ${course.section}` : ''}
        </p>
      </header>
      <CourseTabs courseId={courseId} active="gradebook" />
      <h2 className={styles.heading}>Gradebook</h2>
      <p className={styles.notice}>
        Best final grades for this course assignment. Node quizzes are weighted equally. Each submission retains its
        original deadlines and late-penalty calculation; retries cannot lower the best grade.
      </p>
      <Gradebook courseId={courseId} lessons={lessons} rows={rows} />
    </div>
  );
}
