import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import CourseEditForm from './CourseEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ courseId: string }>;
}

export default async function EditCoursePage({ params }: Props) {
  const { courseId } = await params;
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const [course, availableLessons] = await Promise.all([
    prisma.course.findFirst({
      where: {
        id: courseId,
        OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
      },
      include: {
        courseLessons: {
          include: { lesson: true },
          orderBy: { sortOrder: 'asc' },
        },
        enrollments: true,
        contacts: true,
      },
    }),
    prisma.lesson.findMany({
      where: {
        OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
      },
      select: { id: true, title: true, slug: true },
      orderBy: { title: 'asc' },
    }),
  ]);

  if (!course) {
    notFound();
  }

  return <CourseEditForm course={course} availableLessons={availableLessons} />;
}
