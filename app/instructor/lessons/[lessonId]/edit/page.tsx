import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import LessonEditForm from './LessonEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lessonId: string }>;
}

export default async function EditLessonPage({ params }: Props) {
  const { lessonId } = await params;

  const [lesson, nodes] = await Promise.all([
    prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        lessonNodes: {
          include: { node: true },
          orderBy: { sortOrder: 'asc' },
        },
        lessonNodeEdges: {
          select: { id: true, sourceId: true, targetId: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.node.findMany({
      include: {
        _count: { select: { quizQuestions: true, checkpoints: true } },
      },
      orderBy: { title: 'asc' },
    }),
  ]);

  if (!lesson) {
    notFound();
  }

  const paletteNodes = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    quizBankCount: n._count.quizQuestions,
    checkpointCount: n._count.checkpoints,
  }));

  return <LessonEditForm lesson={lesson} availableNodes={paletteNodes} />;
}
