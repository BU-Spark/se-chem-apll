import Link from 'next/link';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import LearningObjectives from '@/app/components/LearningObjectives/LearningObjectives';
import buttons from '@/app/styles/buttons.module.css';
import screen from '@/app/components/NodeScreenFrame/nodeScreen.module.css';

interface NodeIntroProps {
  nodeTitle: string;
  learningObjectives: string[];
  lessonHref: string;
  videoHref: string;
}

// First screen of a regular (not foundational) node: what the student will learn, then the video.
export default function NodeIntro({ nodeTitle, learningObjectives, lessonHref, videoHref }: NodeIntroProps) {
  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <h1 className={screen.title}>{nodeTitle}</h1>
      <p className={screen.lead}>
        Ready to learn? Take your first step in learning this topic. Click continue to begin the video lesson.
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
