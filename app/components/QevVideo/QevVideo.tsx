'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import YouTubeAuthoringPlayer from '@/app/components/NodeForm/YouTubeAuthoringPlayer';
import { parseYouTubeId } from '@/app/utils/youtube';
import styles from './QevVideo.module.css';

// What the video lesson needs from any player, so YouTube and Mux behave the same.
export interface VideoControls {
  currentTime: () => number;
  duration: () => number;
  pause: () => void;
  play: () => void;
  seekTo: (seconds: number) => void;
  setCaptions: (on: boolean) => void;
}

interface QevVideoProps {
  videoUrl: string | null;
  muxPlaybackId: string | null;
  // Called once the video can be controlled.
  onReady?: (controls: VideoControls) => void;
  // While a question is open the video stays paused: Play is disabled.
  playLocked?: boolean;
}

// YouTube without its own controls or keyboard shortcuts, so students can't skip ahead.
const NO_SKIP_YOUTUBE = { controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3 };
const PROGRESS_MS = 300;
// Players can stop slightly before their reported duration; this close counts as the end.
const END_TOLERANCE_SECONDS = 0.25;

function MuxVideo({ playbackId, onReady }: { playbackId: string; onReady: (controls: VideoControls) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const hlsUrl = `https://stream.mux.com/${playbackId}.m3u8`;
    // Same approach as NodePreview: native HLS (Safari), otherwise hls.js.
    if (!video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
    video.src = hlsUrl;
  }, [playbackId]);

  return (
    // No `controls` attribute: the lesson provides its own buttons so students can't skip ahead.
    <video
      ref={videoRef}
      className={styles.media}
      playsInline
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        onReady({
          currentTime: () => video.currentTime,
          duration: () => video.duration || 0,
          pause: () => video.pause(),
          play: () => void video.play(),
          seekTo: (seconds) => (video.currentTime = seconds),
          setCaptions: (on) => {
            if (hlsRef.current) hlsRef.current.subtitleDisplay = on;
            for (const track of Array.from(video.textTracks)) track.mode = on ? 'showing' : 'hidden';
          },
        });
      }}
    />
  );
}

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * The node's video (YouTube or Mux) with the lesson's own controls: Play/Pause, a view-only
 * progress bar, and captions. There is no seek bar, so the whole video has to be watched.
 */
export default function QevVideo({ videoUrl, muxPlaybackId, onReady, playLocked = false }: QevVideoProps) {
  const youTubeId = videoUrl ? parseYouTubeId(videoUrl) : null;
  const controlsRef = useRef<VideoControls | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [progress, setProgress] = useState({ time: 0, duration: 0 });

  const handleReady = useCallback(
    (controls: VideoControls) => {
      // Wrap play/pause so the button always shows the right state, whoever pauses.
      const tracked: VideoControls = {
        ...controls,
        play: () => {
          controls.play();
          setPlaying(true);
        },
        pause: () => {
          controls.pause();
          setPlaying(false);
        },
      };
      controlsRef.current = tracked;
      setReady(true);
      onReady?.(tracked);
    },
    [onReady]
  );

  // Keep the progress bar moving, and notice when the video reaches its end.
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      const controls = controlsRef.current!;
      const time = controls.currentTime();
      const duration = controls.duration();
      setProgress({ time, duration });
      if (duration > 0 && time >= duration - END_TOLERANCE_SECONDS) setPlaying(false);
    }, PROGRESS_MS);
    return () => clearInterval(timer);
  }, [ready]);

  const hasVideo = Boolean(youTubeId || muxPlaybackId);
  const percent = progress.duration > 0 ? Math.min(100, (100 * progress.time) / progress.duration) : 0;

  return (
    <div className={styles.player}>
      <div className={styles.frame}>
        {youTubeId ? (
          <YouTubeAuthoringPlayer
            videoId={youTubeId}
            playerVars={NO_SKIP_YOUTUBE}
            onReady={(player) =>
              handleReady({
                currentTime: () => player.getCurrentTime(),
                duration: () => player.getDuration(),
                pause: () => player.pauseVideo(),
                play: () => player.playVideo(),
                seekTo: (seconds) => player.seekTo(seconds, true),
                setCaptions: (on) => (on ? player.loadModule('captions') : player.unloadModule('captions')),
              })
            }
          />
        ) : muxPlaybackId ? (
          <MuxVideo playbackId={muxPlaybackId} onReady={handleReady} />
        ) : (
          <p className={styles.missing}>This node has no video yet.</p>
        )}
      </div>

      {hasVideo && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.play}
            onClick={() => (playing ? controlsRef.current?.pause() : controlsRef.current?.play())}
            disabled={!ready || (playLocked && !playing)}
            aria-label={playing ? 'Pause video' : 'Play video'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Video progress"
            aria-valuemin={0}
            aria-valuemax={Math.round(progress.duration)}
            aria-valuenow={Math.round(progress.time)}
            aria-valuetext={`${formatTime(progress.time)} of ${formatTime(progress.duration)}`}
          >
            <span className={styles.fill} style={{ width: `${percent}%` }} />
          </div>
          <span className={styles.time}>{formatTime(progress.time)}</span>
          <button
            type="button"
            className={captions ? `${styles.cc} ${styles.ccOn}` : styles.cc}
            onClick={() => {
              controlsRef.current?.setCaptions(!captions);
              setCaptions(!captions);
            }}
            disabled={!ready}
            aria-pressed={captions}
            aria-label="Captions"
          >
            CC
          </button>
        </div>
      )}
    </div>
  );
}
