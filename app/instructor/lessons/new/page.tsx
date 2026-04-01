import { prisma } from '@/lib/prisma';
import LessonCreateForm from './LessonCreateForm';

export const dynamic = 'force-dynamic';

export default async function NewLessonPage() {
  const [nodes, courses] = await Promise.all([
    prisma.node.findMany({
      include: { _count: { select: { questions: true } } },
      orderBy: { title: 'asc' },
    }),
    prisma.course.findMany({ orderBy: { code: 'asc' } }),
  ]);

  const paletteNodes = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    defaultPassingPercent: n.defaultPassingPercent,
    questionCount: n._count.questions,
  }));

  return <LessonCreateForm availableNodes={paletteNodes} courses={courses} />;
}
