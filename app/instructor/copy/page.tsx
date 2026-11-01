import { prisma } from '@/lib/prisma';
import { requireInstructor, contentScope } from '@/lib/auth/server';
import CopyForm from './CopyForm';

export const dynamic = 'force-dynamic';

export default async function CopyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireInstructor();
  const params = await searchParams;
  const [courses, lessons, nodes, destinations, destinationLessons] = await Promise.all([
    prisma.course.findMany({
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        code: true,
        section: true,
        description: true,
        courseLessons: {
          orderBy: { sortOrder: 'asc' },
          select: { lessonId: true, openDate: true, dueDate: true, lateDeadline: true },
        },
      },
    }),
    prisma.lesson.findMany({
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        isDraft: true,
        lessonNodes: { orderBy: { sortOrder: 'asc' }, select: { nodeId: true } },
      },
    }),
    prisma.node.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true, isDraft: true } }),
    prisma.course.findMany({ where: contentScope(user), orderBy: { title: 'asc' }, select: { id: true, title: true } }),
    prisma.lesson.findMany({ where: contentScope(user), orderBy: { title: 'asc' }, select: { id: true, title: true } }),
  ]);
  return (
    <CopyForm
      courses={courses.map((course) => ({
        ...course,
        courseLessons: course.courseLessons.map((row) => ({
          ...row,
          openDate: row.openDate?.toISOString() ?? null,
          dueDate: row.dueDate?.toISOString() ?? null,
          lateDeadline: row.lateDeadline?.toISOString() ?? null,
        })),
      }))}
      lessons={lessons}
      nodes={nodes}
      destinations={destinations}
      destinationLessons={destinationLessons}
      initial={{
        mode: typeof params.mode === 'string' ? params.mode : 'course',
        sourceCourseId: typeof params.sourceCourseId === 'string' ? params.sourceCourseId : '',
        destinationId: typeof params.destinationId === 'string' ? params.destinationId : '',
        lessonId: typeof params.lessonId === 'string' ? params.lessonId : '',
        nodeId: typeof params.nodeId === 'string' ? params.nodeId : '',
      }}
    />
  );
}
