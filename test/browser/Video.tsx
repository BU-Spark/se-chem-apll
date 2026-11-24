'use client';
import { useEffect, useRef } from 'react';
import type { VideoControls } from '@/app/components/QevVideo/QevVideo';
export const END_TOLERANCE_SECONDS = 1;
export default function Video({ onReady, onEnded }: { onReady?: (c: VideoControls) => void; onEnded?: () => void }) {
  const time = useRef(0);
  useEffect(() => {
    onReady?.({
      currentTime: () => time.current,
      duration: () => 100,
      play() {},
      pause() {},
      seekTo(t: number) {
        time.current = t;
      },
      setCaptions() {},
    });
  }, [onReady]);
  return (
    <div aria-label="Test video">
      <button
        onClick={() => {
          time.current = 10;
        }}
      >
        Advance to checkpoint
      </button>
      <button
        onClick={() => {
          time.current = 100;
          onEnded?.();
        }}
      >
        Reach video end
      </button>
    </div>
  );
}
