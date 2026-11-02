import Link from 'next/link';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import NodeProgressSummary from '@/app/components/NodeProgressSummary/NodeProgressSummary';
import LearningObjectives from '@/app/components/LearningObjectives/LearningObjectives';
import buttons from '@/app/styles/buttons.module.css';
import screen from '@/app/components/NodeScreenFrame/nodeScreen.module.css';

interface RefreshKnowledgeProps {
  lessonHref: string;
  videoHref: string;
  learningObjectives: string[];
  correct: number;
  total: number;
  coursePercent: number;
}

// Shown after failing a node's quiz: the student reviews the video lesson next.
export default function RefreshKnowledge({
  lessonHref,
  videoHref,
  learningObjectives,
  correct,
  total,
  coursePercent,
}: RefreshKnowledgeProps) {
  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <h1 className={screen.title}>Refresh your Knowledge</h1>
      <NodeProgressSummary correct={correct} total={total} coursePercent={coursePercent} />
      <p className={screen.lead}>
        Ready to refresh? Take your first step in learning this topic. Click continue to begin the video lesson.
      </p>
      <LearningObjectives objectives={learningObjectives} />
      <div className={screen.actions}>
        <Link href={lessonHref} className={buttons.secondary}>
          Back
        </Link>
        <Link href={videoHref} className={buttons.primary}>
          Continue
        </Link>
      </div>
    </NodeScreenFrame>
  );
}
