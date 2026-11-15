'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Hls from 'hls.js';
import YouTubeAuthoringPlayer from '@/app/components/NodeForm/YouTubeAuthoringPlayer';
import { parseYouTubeId } from '@/app/utils/youtube';
import styles from './QevVideo.module.css';

// What the video lesson needs from any player, so YouTube and Mux behave the same.
export interface VideoControls {
  currentTime: () => number;
  duration: () => number;
  // The player itself says the video has finished.
  ended: () => boolean;
  pause: () => void;
  play: () => void;
  seekTo: (seconds: number) => void;
  setCaptions: (on: boolean) => void;
  setSpeed: (rate: number) => void;
}

interface QevVideoProps {
  videoUrl: string | null;
  muxPlaybackId: string | null;
  // Called once the video can be controlled.
  onReady?: (controls: VideoControls) => void;
  // While a question is open the video stays paused: Play is disabled.
  playLocked?: boolean;
  // Called once the video reaches its end.
  onEnded?: () => void;
  // Where to start, in seconds (to resume where the student left); counts as already watched.
  startAt?: number;
}

// YouTube without its own controls or keyboard shortcuts, so students can't skip ahead.
const NO_SKIP_YOUTUBE = { controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3 };
const PROGRESS_MS = 300;
// Players can stop slightly before their reported duration, so the last second counts as the end.
// Shared by every video screen so they agree on when a video has ended.
export const END_TOLERANCE_SECONDS = 1;

// YouTube's state number for a finished video.
const YOUTUBE_ENDED = 0;

/**
 * Whether the video is at its end. The player's own "ended" counts too: after jumping to the end,
 * YouTube reports the video as ended but can keep returning an old current time.
 */
export const hasEnded = (controls: VideoControls) =>
  controls.ended() ||
  (controls.duration() > 0 && controls.currentTime() >= controls.duration() - END_TOLERANCE_SECONDS);

// Students can slow down, never speed up.
const SPEEDS = [1, 0.75, 0.5];
const REWIND_SECONDS = 10;

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
          ended: () => video.ended,
          pause: () => video.pause(),
          play: () => void video.play(),
          seekTo: (seconds) => (video.currentTime = seconds),
          setSpeed: (rate) => (video.playbackRate = rate),
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
 * The node's video (YouTube or Mux) with the lesson's own controls: Play/Pause, a seek bar that
 * only goes back (to anything already watched, never past the furthest point), Back 10 seconds,
 * slower speeds, and captions. It pauses when the student leaves the tab.
 */
export default function QevVideo({
  videoUrl,
  muxPlaybackId,
  onReady,
  playLocked = false,
  onEnded,
  startAt = 0,
}: QevVideoProps) {
  const youTubeId = videoUrl ? parseYouTubeId(videoUrl) : null;
  const controlsRef = useRef<VideoControls | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [progress, setProgress] = useState({ time: startAt, duration: 0 });
  const [ended, setEnded] = useState(false);
  // The furthest point watched: the student can go back to anything before it, never past it.
  const [furthest, setFurthest] = useState(startAt);
  const [speed, setSpeed] = useState(1);
  const [pausedAway, setPausedAway] = useState(false);

  const handleReady = useCallback(
    (controls: VideoControls) => {
      // Wrap play/pause so the button always shows the right state, whoever pauses.
      const tracked: VideoControls = {
        ...controls,
        play: () => {
          controls.play();
          setPlaying(true);
          setPausedAway(false);
        },
        pause: () => {
          controls.pause();
          setPlaying(false);
        },
      };
      // Jumping in a video that hasn't started makes YouTube play it, so pause it again.
      if (startAt > 0) {
        controls.seekTo(startAt);
        controls.pause();
      }
      controlsRef.current = tracked;
      setReady(true);
      onReady?.(tracked);
    },
    [onReady, startAt]
  );

  // Keep the progress bar moving, and notice when the video reaches its end.
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      const controls = controlsRef.current!;
      const atEnd = hasEnded(controls);
      const duration = controls.duration();
      // At the end, show the full bar even if the player still reports an older time.
      const time = atEnd ? duration : controls.currentTime();
      setProgress({ time, duration });
      setFurthest((previous) => Math.max(previous, time));
      setEnded(atEnd);
      if (atEnd) setPlaying(false);
    }, PROGRESS_MS);
    return () => clearInterval(timer);
  }, [ready]);

  // Leaving the tab pauses the video; the student presses Play to continue.
  useEffect(() => {
    if (!playing) return;
    const pauseIfHidden = () => {
      if (!document.hidden) return;
      controlsRef.current?.pause();
      setPausedAway(true);
    };
    document.addEventListener('visibilitychange', pauseIfHidden);
    return () => document.removeEventListener('visibilitychange', pauseIfHidden);
  }, [playing]);

  // Moves the video, but never past the furthest point watched.
  function seek(seconds: number) {
    const target = Math.max(0, Math.min(seconds, furthest));
    controlsRef.current?.seekTo(target);
    setProgress((previous) => ({ ...previous, time: target }));
  }

  // Tell the page once per video load, even if it re-renders or the student watches the end again.
  const reportedEnd = useRef(false);
  useEffect(() => {
    if (!ended || reportedEnd.current) return;
    reportedEnd.current = true;
    onEnded?.();
  }, [ended, onEnded]);

  const hasVideo = Boolean(youTubeId || muxPlaybackId);
  const percentOf = (seconds: number) =>
    progress.duration > 0 ? Math.min(100, (100 * seconds) / progress.duration) : 0;

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
                ended: () => player.getPlayerState() === YOUTUBE_ENDED,
                pause: () => player.pauseVideo(),
                play: () => player.playVideo(),
                seekTo: (seconds) => player.seekTo(seconds, true),
                setSpeed: (rate) => player.setPlaybackRate(rate),
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
          <button
            type="button"
            className={styles.pill}
            onClick={() => seek(progress.time - REWIND_SECONDS)}
            disabled={!ready || playLocked}
            aria-label={`Back ${REWIND_SECONDS} seconds`}
          >
            ↺ {REWIND_SECONDS}
          </button>
          <input
            type="range"
            className={styles.track}
            min={0}
            max={Math.max(progress.duration, 1)}
            step={0.1}
            value={progress.time}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            disabled={!ready || playLocked}
            aria-label="Video position"
            aria-valuetext={`${formatTime(progress.time)} of ${formatTime(progress.duration)}`}
            // Colors the bar: played, then watched (can go back to), then not watched yet.
            style={
              { '--played': `${percentOf(progress.time)}%`, '--watched': `${percentOf(furthest)}%` } as CSSProperties
            }
          />
          <span className={styles.time}>{formatTime(progress.time)}</span>
          <select
            className={styles.pill}
            value={speed}
            onChange={(event) => {
              const rate = Number(event.currentTarget.value);
              controlsRef.current?.setSpeed(rate);
              setSpeed(rate);
            }}
            disabled={!ready}
            aria-label="Playback speed"
          >
            {SPEEDS.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
          <button
            type="button"
            className={captions ? `${styles.pill} ${styles.ccOn}` : styles.pill}
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
      {pausedAway && (
        <p role="status" className={styles.away}>
          Paused while you were away. Press play to continue.
        </p>
      )}
    </div>
  );
}
