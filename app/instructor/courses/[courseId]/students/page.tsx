import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import CourseStudentsManager from './CourseStudentsManager';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ courseId: string }>;
}

export default async function CourseStudentsPage({ params }: Props) {
  const { courseId } = await params;
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: {
      enrollments: {
        include: { student: true },
        orderBy: { createdAt: 'asc' },
      },
      courseLessons: {
        include: {
          lesson: {
            include: {
              lessonNodes: { include: { node: true }, orderBy: { sortOrder: 'asc' } },
            },
          },
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
      lessons={course.courseLessons.map((cl) => cl.lesson)}
    />
  );
}
