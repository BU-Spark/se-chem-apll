import { nodeLibraryScope } from '@/lib/workspaces/permissions';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { requireInstructor } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { nodeInclude } from '@/app/utils/nodeContent';
import NodeEditForm from './NodeEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ nodeId: string }>;
}

export default async function EditNodePage({ params }: Props) {
  const { nodeId } = await params;
  const user = await requireInstructor();

  const node = await prisma.node.findFirst({
    where: {
      id: nodeId,
      ...nodeLibraryScope(user),
    },
    include: nodeInclude,
  });

  if (!node) notFound();
  if (node.workspaceId) redirect(`/workspaces/${node.workspaceId}/nodes/${node.id}`);

  return (
    <NodeEditForm
      node={{
        id: node.id,
        isDraft: node.isDraft,
        title: node.title,
        summary: node.summary ?? '',
        videoUrl: node.videoUrl ?? '',
        tags: node.tags,
        learningObjectives: node.learningObjectives,
        checkpoints: node.checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          timeOffsetSeconds: checkpoint.timeOffsetSeconds,
          checkpointKey: checkpoint.checkpointKey,
          placementHint: checkpoint.placementHint,
          questions: checkpoint.questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            feedbackCorrect: q.feedbackCorrect,
            feedbackIncorrect: q.feedbackIncorrect,
            options: q.options,
            correctIndices: q.correctIndices,
            kind: q.kind,
          })),
        })),
        quizQuestions: node.quizQuestions.map((q) => ({
          variants: q.variants,
          id: q.id,
          prompt: q.prompt,
          feedbackCorrect: q.feedbackCorrect,
          feedbackIncorrect: q.feedbackIncorrect,
          options: q.options,
          correctIndices: q.correctIndices,
        })),
      }}
    />
  );
}
