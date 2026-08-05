import { prisma } from '@/lib/prisma';
import LessonCreateForm from './LessonCreateForm';

export const dynamic = 'force-dynamic';

export default async function NewLessonPage() {
  const [nodes, courses] = await Promise.all([
    prisma.node.findMany({
      include: {
        _count: { select: { questions: true } },
        questions: { where: { isPreLecture: true }, select: { id: true } },
      },
      orderBy: { title: 'asc' },
    }),
    prisma.course.findMany({ orderBy: { code: 'asc' } }),
  ]);

  const paletteNodes = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    questionCount: n._count.questions,
    preLectureCount: n.questions.length,
  }));

  return <LessonCreateForm availableNodes={paletteNodes} courses={courses} />;
}
