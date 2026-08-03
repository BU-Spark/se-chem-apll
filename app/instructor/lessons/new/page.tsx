import { prisma } from '@/lib/prisma';
import LessonCreateForm from './LessonCreateForm';

export const dynamic = 'force-dynamic';

export default async function NewLessonPage() {
  const [nodes, courses] = await Promise.all([
    prisma.node.findMany({
      include: {
        _count: { select: { quizQuestions: true, checkpoints: true } },
      },
      orderBy: { title: 'asc' },
    }),
    prisma.course.findMany({ orderBy: { code: 'asc' } }),
  ]);

  const paletteNodes = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    quizBankCount: n._count.quizQuestions,
    checkpointCount: n._count.checkpoints,
  }));

  return <LessonCreateForm availableNodes={paletteNodes} courses={courses} />;
}
