'use client';

import NodeForm from '@/app/components/NodeForm/NodeForm';
import type { NodeFormInitial } from '@/app/components/NodeForm/types';

type Props = {
  workspaceId?: string;
  returnTo?: string;
  node: NodeFormInitial & { id: string };
};

export default function NodeEditForm({ node, workspaceId, returnTo }: Props) {
  return (
    <NodeForm
      workspaceId={workspaceId}
      returnTo={returnTo}
      mode="edit"
      nodeId={node.id}
      initial={{
        isDraft: node.isDraft,
        title: node.title,
        summary: node.summary,
        videoUrl: node.videoUrl,
        tags: node.tags,
        learningObjectives: node.learningObjectives,
        checkpoints: node.checkpoints,
        quizQuestions: node.quizQuestions,
      }}
    />
  );
}
