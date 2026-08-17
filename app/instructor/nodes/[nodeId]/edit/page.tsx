import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { nodeInclude } from '@/app/utils/nodeContent';
import NodeEditForm from './NodeEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ nodeId: string }>;
}

export default async function EditNodePage({ params }: Props) {
  const { nodeId } = await params;
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const node = await prisma.node.findFirst({
    where: {
      id: nodeId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
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
        learningObjectives: node.learningObjectives,
        checkpoints: node.checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          timeOffsetSeconds: checkpoint.timeOffsetSeconds,
          questions: checkpoint.questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            options: q.options,
            correctIndices: q.correctIndices,
            kind: q.kind,
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
