import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { nodeInclude } from '@/app/utils/nodeContent';
import NodeEditForm from './NodeEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ nodeId: string }>;
}

export default async function EditNodePage({ params }: Props) {
  const { nodeId } = await params;

  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: nodeInclude,
  });

  if (!node) notFound();

  return (
    <NodeEditForm
      node={{
        id: node.id,
        title: node.title,
        summary: node.summary ?? '',
        videoUrl: node.videoUrl ?? '',
        checkpoints: node.checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          timeOffsetSeconds: checkpoint.timeOffsetSeconds,
          questions: checkpoint.questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            options: q.options,
            correctIndices: q.correctIndices,
          })),
        })),
        quizQuestions: node.quizQuestions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          correctIndices: q.correctIndices,
        })),
      }}
    />
  );
}
