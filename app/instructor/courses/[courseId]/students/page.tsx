import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { requireInstructor, contentScope, isAdmin } from '@/lib/auth/server';
import CourseStudentsManager from './CourseStudentsManager';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ courseId: string }>;
}

export default async function CourseStudentsPage({ params }: Props) {
  const { courseId } = await params;
  const user = await requireInstructor();

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      ...contentScope(user),
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

  const canManageJoinCode = isAdmin(user) || course.createdByClerkId === user.clerkUserId;
  const joinCode = canManageJoinCode
    ? await prisma.courseJoinCode.findUnique({ where: { courseId }, select: { code: true } })
    : null;

  return (
    <CourseStudentsManager
      courseId={course.id}
      courseTitle={course.title}
      courseCode={course.code}
      courseSection={course.section}
      initialJoinCode={canManageJoinCode ? (joinCode?.code ?? null) : undefined}
      initialEnrollments={course.enrollments}
      lessons={course.courseLessons.map((cl) => cl.lesson)}
    />
  );
}
