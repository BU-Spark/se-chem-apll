import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import CourseEditForm from './CourseEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ courseId: string }>;
}

export default async function EditCoursePage({ params }: Props) {
  const { courseId } = await params;

  const [course, availableLessons] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
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
      select: { id: true, title: true, slug: true },
      orderBy: { title: 'asc' },
    }),
  ]);

  if (!course) {
    notFound();
  }

  return <CourseEditForm course={course} availableLessons={availableLessons} />;
}
