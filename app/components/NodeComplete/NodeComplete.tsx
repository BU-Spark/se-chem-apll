import Link from 'next/link';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import NodeProgressSummary from '@/app/components/NodeProgressSummary/NodeProgressSummary';
import buttons from '@/app/styles/buttons.module.css';
import screen from '@/app/components/NodeScreenFrame/nodeScreen.module.css';

interface NodeCompleteProps {
  lessonHref: string;
  correct: number;
  total: number;
  coursePercent: number;
}

// Shown after passing a node's quiz (and when reopening a completed node).
export default function NodeComplete({ lessonHref, correct, total, coursePercent }: NodeCompleteProps) {
  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <h1 className={screen.title}>Node Complete</h1>
      <NodeProgressSummary correct={correct} total={total} coursePercent={coursePercent} />
      <p className={screen.lead}>You did it!</p>
      <p className={screen.text}>
        You&rsquo;ve completed this node. Take a moment to celebrate your progress, then keep moving forward.
      </p>
      <Link href={lessonHref} className={buttons.primary}>
        Return to Lesson
      </Link>
    </NodeScreenFrame>
  );
}
