import { prisma } from '@/lib/prisma';
import CourseCreateForm from './CourseCreateForm';
import { requireInstructor, contentScope } from '@/lib/auth/server';
export const dynamic = 'force-dynamic';

export default async function NewCoursePage() {
  const user = await requireInstructor();
  const availableLessons = await prisma.lesson.findMany({
    where: {
      isDraft: false,
      ...contentScope(user),
    },
    select: { id: true, title: true, slug: true },
    orderBy: { title: 'asc' },
  });

  return (
    <CourseCreateForm availableLessons={availableLessons.map((lesson) => ({ ...lesson, slug: lesson.slug ?? '' }))} />
  );
}
