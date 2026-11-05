import Link from 'next/link';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import NodeProgressSummary from '@/app/components/NodeProgressSummary/NodeProgressSummary';
import buttons from '@/app/styles/buttons.module.css';
import screen from '@/app/components/NodeScreenFrame/nodeScreen.module.css';

interface VideoResultProps {
  passed: boolean;
  // After passing, foundational nodes offer a rewatch; regular nodes offer Back to the map.
  isFoundational: boolean;
  correct: number;
  total: number;
  coursePercent: number;
  lessonHref: string;
  rewatchHref: string;
  quizHref: string;
}

// After the video lesson: "Great Job!" at or above the pass mark, otherwise a nudge to rewatch.
// Continue goes to the quiz either way.
export default function VideoResult({
  passed,
  isFoundational,
  correct,
  total,
  coursePercent,
  lessonHref,
  rewatchHref,
  quizHref,
}: VideoResultProps) {
  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <h1 className={screen.title}>{passed ? 'Great Job!' : 'Refresh Your Knowledge'}</h1>
      <NodeProgressSummary correct={correct} total={total} coursePercent={coursePercent} />
      {passed ? (
        <p className={screen.lead}>You can continue onto the assessment.</p>
      ) : (
        <>
          <p className={screen.lead}>Every step forward starts with understanding.</p>
          <p className={screen.text}>We recommend revisiting the video lesson before moving on to the assessment.</p>
        </>
      )}
      <div className={screen.actions}>
        {passed && !isFoundational ? (
          <Link href={lessonHref} className={buttons.secondary}>
            Back
          </Link>
        ) : (
          <Link href={rewatchHref} className={passed ? buttons.secondary : buttons.primary}>
            Rewatch
          </Link>
        )}
        <Link href={quizHref} className={passed ? buttons.primary : buttons.secondary}>
          Continue
        </Link>
      </div>
    </NodeScreenFrame>
  );
}
