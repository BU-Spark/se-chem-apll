'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
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
}

// A node's video without questions: Continue to the quiz appears once the video has ended.
export default function WatchVideo({ nodeTitle, video, lessonHref, quizHref }: WatchVideoProps) {
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
      {ended ? (
        <Link href={quizHref} className={buttons.primary}>
          Continue
        </Link>
      ) : (
        <p>Finish the video to continue.</p>
      )}
    </NodeScreenFrame>
  );
}
