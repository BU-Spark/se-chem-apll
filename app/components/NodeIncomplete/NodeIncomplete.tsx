import Link from 'next/link';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import NodeProgressSummary from '@/app/components/NodeProgressSummary/NodeProgressSummary';
import buttons from '@/app/styles/buttons.module.css';
import screen from '@/app/components/NodeScreenFrame/nodeScreen.module.css';

interface NodeIncompleteProps {
  correct: number;
  total: number;
  coursePercent: number;
  lessonHref: string;
}

// After every quiz try is used up: the node is incomplete, but the student can move on.
export default function NodeIncomplete({ correct, total, coursePercent, lessonHref }: NodeIncompleteProps) {
  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <h1 className={screen.title}>Node Incomplete</h1>
      <NodeProgressSummary correct={correct} total={total} coursePercent={coursePercent} />
      <p className={screen.lead}>A Step Back Before Moving Forward</p>
      <p className={screen.text}>Reach out to your instructor for further help.</p>
      <Link href={lessonHref} className={buttons.primary}>
        Return to Lesson
      </Link>
    </NodeScreenFrame>
  );
}
