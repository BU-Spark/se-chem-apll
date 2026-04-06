import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import LessonEditForm from './LessonEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lessonId: string }>;
}

export default async function EditLessonPage({ params }: Props) {
  const { lessonId } = await params;

  const [lesson, nodes, courses] = await Promise.all([
    prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: true,
        lessonNodes: {
          include: { node: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.node.findMany({
      include: { _count: { select: { questions: true } } },
      orderBy: { title: 'asc' },
    }),
    prisma.course.findMany({ orderBy: { code: 'asc' } }),
  ]);

  if (!lesson) {
    notFound();
  }

  const paletteNodes = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    defaultPassingPercent: n.defaultPassingPercent,
    questionCount: n._count.questions,
  }));

  return <LessonEditForm lesson={lesson} availableNodes={paletteNodes} courses={courses} />;
}
