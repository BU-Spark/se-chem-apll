'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          width?: number | string;
          height?: number | string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
          };
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type YTPlayer = {
  getCurrentTime: () => number;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
};

type Props = {
  videoId: string;
  onReady?: (player: YTPlayer) => void;
};

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

    const existing = document.querySelector('script[data-youtube-iframe-api]');
    if (existing) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.youtubeIframeApi = 'true';
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Failed to load YouTube IFrame API'));
    };
    document.body.appendChild(script);
  });

  return apiPromise;
}

export default function YouTubeAuthoringPlayer({ videoId, onReady }: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    let cancelled = false;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const mount = document.createElement('div');
    wrapper.replaceChildren(mount);
    mountRef.current = mount;

    loadYouTubeApi()
      .then(() => {
        if (cancelled || !window.YT?.Player || !mountRef.current) return;
        playerRef.current?.destroy();
        playerRef.current = new window.YT.Player(mountRef.current, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            enablejsapi: 1,
            rel: 0,
            modestbranding: 1,
          },
          events: {
            onReady: (event) => {
              if (!cancelled) onReadyRef.current?.(event.target);
            },
          },
        });
      })
      .catch(() => {
        // Leave the wrapper empty; the form can still author manually without a player.
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      if (mountRef.current?.parentNode) {
        mountRef.current.parentNode.removeChild(mountRef.current);
      }
      mountRef.current = null;
    };
  }, [videoId]);

  return <div ref={wrapperRef} />;
}
