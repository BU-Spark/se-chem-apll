import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import CourseStudentsManager from './CourseStudentsManager';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ courseId: string }>;
}

export default async function CourseStudentsPage({ params }: Props) {
  const { courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      enrollments: {
        include: { student: true },
        orderBy: { createdAt: 'asc' },
      },
      lessons: {
        include: {
          lessonNodes: { include: { node: true }, orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!course) notFound();

  return (
    <CourseStudentsManager
      courseId={course.id}
      courseTitle={course.title}
      courseCode={course.code}
      courseSection={course.section}
      initialEnrollments={course.enrollments}
      lessons={course.lessons}
    />
  );
}
