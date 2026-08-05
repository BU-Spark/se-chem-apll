import { prisma } from '@/lib/prisma';
import CourseCreateForm from './CourseCreateForm';

export const dynamic = 'force-dynamic';

export default async function NewCoursePage() {
  const availableLessons = await prisma.lesson.findMany({
    select: { id: true, title: true, slug: true },
    orderBy: { title: 'asc' },
  });

  return <CourseCreateForm availableLessons={availableLessons} />;
}
