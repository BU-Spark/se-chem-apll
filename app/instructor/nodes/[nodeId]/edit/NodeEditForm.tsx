'use client';

import NodeForm from '@/app/components/NodeForm/NodeForm';
import type { NodeFormInitial } from '@/app/components/NodeForm/types';

type Props = {
  node: NodeFormInitial & { id: string };
};

export default function NodeEditForm({ node }: Props) {
  return (
    <NodeForm
      mode="edit"
      nodeId={node.id}
      initial={{
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
