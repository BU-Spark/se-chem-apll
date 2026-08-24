import { prisma } from '@/lib/prisma';
import CourseCreateForm from './CourseCreateForm';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';

export default async function NewCoursePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }
  const availableLessons = await prisma.lesson.findMany({
    where: {
      isDraft: false,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    select: { id: true, title: true, slug: true },
    orderBy: { title: 'asc' },
  });

  return (
    <CourseCreateForm availableLessons={availableLessons.map((lesson) => ({ ...lesson, slug: lesson.slug ?? '' }))} />
  );
}
