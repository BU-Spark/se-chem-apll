import Link from 'next/link';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import NodeProgressSummary from '@/app/components/NodeProgressSummary/NodeProgressSummary';
import { ROUTES } from '@/app/routes';
import buttons from '@/app/styles/buttons.module.css';
import screen from '@/app/components/NodeScreenFrame/nodeScreen.module.css';

interface NodeClosedProps {
  correct: number;
  total: number;
  coursePercent: number;
  lessonHref: string;
  // The node's YouTube video; null when it has none (the button then goes to "coming soon").
  videoUrl: string | null;
}

// Any node of a past-due lesson: the quiz is closed, but the student can still review.
export default function NodeClosed({ correct, total, coursePercent, lessonHref, videoUrl }: NodeClosedProps) {
  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <h1 className={screen.title}>Node Closed</h1>
      <NodeProgressSummary correct={correct} total={total} coursePercent={coursePercent} />
      <p className={screen.lead}>This lesson is past due.</p>
      <p className={screen.text}>The quiz is closed, but you can still review what you&rsquo;ve learned.</p>
      <div className={screen.actions}>
        {videoUrl ? (
          <a href={videoUrl} className={buttons.secondary} target="_blank" rel="noopener noreferrer">
            Review Video
          </a>
        ) : (
          <Link href={ROUTES.comingSoon} className={buttons.secondary}>
            Review Video
          </Link>
        )}
        <Link href={ROUTES.comingSoon} className={buttons.secondary}>
          Study Guide
        </Link>
        <Link href={ROUTES.comingSoon} className={buttons.secondary}>
          Practice Questions
        </Link>
      </div>
      <Link href={lessonHref} className={buttons.primary}>
        Return to Lesson
      </Link>
    </NodeScreenFrame>
  );
}
