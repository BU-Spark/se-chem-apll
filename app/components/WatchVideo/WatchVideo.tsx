'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAttemptApi from '@/app/hooks/useAttemptApi';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import QevVideo, { END_TOLERANCE_SECONDS, type VideoControls } from '@/app/components/QevVideo/QevVideo';
import DevSkipButton from '@/app/components/DevSkipButton/DevSkipButton';
import buttons from '@/app/styles/buttons.module.css';
import styles from './WatchVideo.module.css';

interface WatchVideoProps {
  nodeTitle: string;
  video: { url: string | null; muxPlaybackId: string | null };
  lessonHref: string;
  quizHref: string;
  review?: { courseLessonId: string; lessonNodeId: string; doneHref: string };
}

// A node's video without questions: Continue to the quiz appears once the video has ended.
export default function WatchVideo({ nodeTitle, video, lessonHref, quizHref, review }: WatchVideoProps) {
  const router = useRouter();
  const { post, run, busy, error } = useAttemptApi(review?.courseLessonId ?? '');
  const reviewKey = useRef<string | null>(null);
  async function markReviewed() {
    await run(async () => {
      reviewKey.current ??= crypto.randomUUID();
      const attempt = await post({
        action: 'start',
        kind: 'REVIEW',
        nodeId: review!.lessonNodeId,
        key: reviewKey.current,
      });
      await post({ action: 'finish', attemptId: attempt.id, answers: [], submitWhenReady: true, videoEnded: true });
      router.push(review!.doneHref);
      router.refresh();
    });
  }
  const controls = useRef<VideoControls | null>(null);
  // Without a video there's nothing to wait for.
  const [ended, setEnded] = useState(!video.url && !video.muxPlaybackId);

  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <h1 className={styles.title}>{nodeTitle} Video Lesson</h1>
      <div className={styles.video}>
        <QevVideo
          videoUrl={video.url}
          muxPlaybackId={video.muxPlaybackId}
          onReady={(c) => (controls.current = c)}
          onEnded={() => setEnded(true)}
        />
        {!ended && (
          // Land inside the end tolerance, so the video counts as ended even if it stays paused.
          <DevSkipButton
            onClick={() => controls.current?.seekTo(controls.current.duration() - END_TOLERANCE_SECONDS / 2)}
          >
            Skip to end (dev only)
          </DevSkipButton>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {ended && review ? (
        <button type="button" className={buttons.primary} disabled={busy} onClick={markReviewed}>
          {busy ? 'Saving…' : 'Mark reviewed'}
        </button>
      ) : ended ? (
        <Link href={quizHref} className={buttons.primary}>
          Continue
        </Link>
      ) : (
        <p>Finish the video to continue.</p>
      )}
    </NodeScreenFrame>
  );
}
