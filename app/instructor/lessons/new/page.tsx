import { prisma } from '@/lib/prisma';
import LessonCreateForm from './LessonCreateForm';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NewLessonPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }
  const nodes = await prisma.node.findMany({
    where: {
      isDraft: false,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: {
      _count: { select: { quizQuestions: true, checkpoints: true } },
    },
    orderBy: { title: 'asc' },
  });

  const paletteNodes = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    quizBankCount: n._count.quizQuestions,
    checkpointCount: n._count.checkpoints,
  }));

  return <LessonCreateForm availableNodes={paletteNodes} />;
}
