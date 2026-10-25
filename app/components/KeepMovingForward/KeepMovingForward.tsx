import Link from 'next/link';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import NodeProgressSummary from '@/app/components/NodeProgressSummary/NodeProgressSummary';
import buttons from '@/app/styles/buttons.module.css';
import screen from '@/app/components/NodeScreenFrame/nodeScreen.module.css';

interface KeepMovingForwardProps {
  correct: number;
  total: number;
  coursePercent: number;
  lessonHref: string;
  // Retry starts with the video lesson again.
  retryHref: string;
}

// After the quiz is failed a second time (after the video): one more try is left.
export default function KeepMovingForward({
  correct,
  total,
  coursePercent,
  lessonHref,
  retryHref,
}: KeepMovingForwardProps) {
  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <h1 className={screen.title}>Keep Moving Forward</h1>
      <NodeProgressSummary correct={correct} total={total} coursePercent={coursePercent} />
      <p className={screen.lead}>Try Again, You&rsquo;ve Got This!</p>
      <p className={screen.text}>Give the Video Lesson another try. Review what you learned and take another shot.</p>
      <div className={screen.actions}>
        <Link href={lessonHref} className={buttons.secondary}>
          Back
        </Link>
        <Link href={retryHref} className={buttons.primary}>
          Retry
        </Link>
      </div>
    </NodeScreenFrame>
  );
}
