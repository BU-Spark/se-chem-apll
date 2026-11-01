import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { requireInstructor, contentScope } from '@/lib/auth/server';
import CourseEditForm from './CourseEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ courseId: string }>;
}

export default async function EditCoursePage({ params }: Props) {
  const { courseId } = await params;
  const user = await requireInstructor();

  const [course, availableLessons] = await Promise.all([
    prisma.course.findFirst({
      where: {
        id: courseId,
        ...contentScope(user),
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
        isDraft: false,
        ...contentScope(user),
      },
      select: { id: true, title: true, slug: true },
      orderBy: { title: 'asc' },
    }),
  ]);

  if (!course) {
    notFound();
  }

  return (
    <CourseEditForm
      course={course}
      availableLessons={availableLessons.map((lesson) => ({ ...lesson, slug: lesson.slug ?? '' }))}
    />
  );
}
