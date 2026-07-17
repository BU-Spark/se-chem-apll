import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import CourseEditForm from './CourseEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ courseId: string }>;
}

export default async function EditCoursePage({ params }: Props) {
  const { courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      lessons: { orderBy: { sortOrder: 'asc' } },
      enrollments: true,
      contacts: true,
    },
  });

  if (!course) {
    notFound();
  }

  return <CourseEditForm course={course} />;
}
