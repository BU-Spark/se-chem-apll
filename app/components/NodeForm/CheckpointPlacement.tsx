'use client';

import { useRef, useState } from 'react';
import type { FormCheckpoint } from './types';
import YouTubeAuthoringPlayer, { type YTPlayer } from './YouTubeAuthoringPlayer';
import CheckpointGroupPreview from './CheckpointGroupPreview';
import { formatTimeOffsetSeconds } from '@/app/utils/questionTimestamps';
import styles from './CheckpointPlacement.module.css';
import formStyles from './NodeForm.module.css';

type Props = {
  checkpoints: FormCheckpoint[];
  videoId: string | null;
  onChange: (checkpoints: FormCheckpoint[]) => void;
  onSaveDraft: () => void;
  saving?: boolean;
};
export default function CheckpointPlacement({ checkpoints, videoId, onChange, onSaveDraft, saving = false }: Props) {
  const [selected, setSelected] = useState<string | null>(
    () => (checkpoints.find((c) => c.timeOffsetSeconds === null) ?? checkpoints[0])?.id ?? null
  );
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const unplaced = checkpoints.filter((c) => c.timeOffsetSeconds === null);
  function assign(id: string, seconds: number | null) {
    if (seconds !== null && (!Number.isInteger(seconds) || seconds < 0 || seconds > 2147483647)) {
      setError({ id, message: 'Enter a valid whole-second timestamp.' });
      return;
    }
    const conflict = checkpoints.find((c) => c.id !== id && seconds !== null && c.timeOffsetSeconds === seconds);
    if (conflict) {
      setError({ id, message: `That time is already assigned to ${conflict.checkpointKey}. Choose another time.` });
      return;
    }
    setError(null);
    onChange(checkpoints.map((c) => (c.id === id ? { ...c, timeOffsetSeconds: seconds } : c)));
  }
  const outOfOrder = checkpoints.some(
    (c, index) =>
      c.timeOffsetSeconds !== null &&
      checkpoints
        .slice(0, index)
        .some((prior) => prior.timeOffsetSeconds !== null && prior.timeOffsetSeconds > c.timeOffsetSeconds!)
  );
  return (
    <section className={`${formStyles.section} ${formStyles.checkpointSection}`} aria-label="Checkpoint placement">
      <div className={styles.heading}>
        <div className={styles.headingText}>
          <h2 className={styles.title}>Assign checkpoint timestamps</h2>
          <p className={styles.subtitle}>Select a group, find its place in the video, and assign a time.</p>
        </div>
        <button type="button" className={formStyles.draftBtn} onClick={onSaveDraft} disabled={saving}>
          {saving ? 'Saving…' : 'Save as draft'}
        </button>
      </div>
      <p className={styles.progress} role="status">
        {checkpoints.length - unplaced.length} of {checkpoints.length} groups assigned
      </p>
      <div className={styles.workspace}>
        <aside className={styles.player}>
          {videoId ? (
            <div className={formStyles.videoWrap}>
              <YouTubeAuthoringPlayer
                videoId={videoId}
                onReady={(value) => {
                  player.current = value;
                  setReady(true);
                }}
              />
            </div>
          ) : (
            <div className={styles.noVideo}>
              <strong>Add a video to place groups during playback</strong>
              <p>
                Add a YouTube URL in Basics. You can enter known times manually or save this draft and return later.
              </p>
            </div>
          )}
          <p className={styles.hint}>Assignments stay with this draft. Save the node to keep your changes.</p>
        </aside>
        <div className={styles.groups}>
          {checkpoints.map((checkpoint, index) => (
            <CheckpointGroupPreview
              key={checkpoint.id}
              checkpoint={checkpoint}
              index={index}
              open={selected === checkpoint.id}
              onSelect={() => {
                setSelected(selected === checkpoint.id ? null : checkpoint.id);
                setError(null);
              }}
            >
              {selected === checkpoint.id && (
                <>
                  <div className={styles.controls}>
                    {videoId && (
                      <button
                        type="button"
                        className={formStyles.submitBtn}
                        disabled={!ready}
                        onClick={() => {
                          try {
                            const seconds = player.current?.getCurrentTime();
                            if (seconds === undefined || !Number.isFinite(seconds)) throw new Error();
                            player.current?.pauseVideo();
                            assign(checkpoint.id, Math.floor(seconds));
                          } catch {
                            setError({
                              id: checkpoint.id,
                              message: 'The video is not ready. Try again or enter a time manually.',
                            });
                          }
                        }}
                      >
                        Use current video time
                      </button>
                    )}
                    <TimeEntry
                      key={`${checkpoint.id}-${checkpoint.timeOffsetSeconds}`}
                      seconds={checkpoint.timeOffsetSeconds}
                      onAssign={(seconds) => assign(checkpoint.id, seconds)}
                      onError={(message) => setError({ id: checkpoint.id, message })}
                    />
                    {checkpoint.timeOffsetSeconds !== null && (
                      <button type="button" className={formStyles.seekBtn} onClick={() => assign(checkpoint.id, null)}>
                        Clear time
                      </button>
                    )}
                  </div>
                  {error?.id === checkpoint.id && (
                    <p role="alert" className={styles.error}>
                      {error.message}
                    </p>
                  )}
                </>
              )}
            </CheckpointGroupPreview>
          ))}
          <div className={styles.controls}>
            <button
              type="button"
              className={formStyles.secondaryBtn}
              disabled={!unplaced.some((c) => c.id !== selected)}
              onClick={() => {
                const index = checkpoints.findIndex((c) => c.id === selected);
                const next = [...checkpoints.slice(index + 1), ...checkpoints.slice(0, index + 1)].find(
                  (c) => c.timeOffsetSeconds === null && c.id !== selected
                );
                setSelected(next?.id ?? selected);
                setError(null);
              }}
            >
              Next unassigned group
            </button>
            {unplaced.length === 0 && <span className={styles.time}>All groups assigned</span>}
          </div>
          {outOfOrder && (
            <div className={styles.orderNotice}>
              <p>Assigned times differ from the authored group order.</p>
              <button
                type="button"
                className={formStyles.secondaryBtn}
                onClick={() =>
                  onChange(
                    [...checkpoints].sort(
                      (a, b) => (a.timeOffsetSeconds ?? Infinity) - (b.timeOffsetSeconds ?? Infinity)
                    )
                  )
                }
              >
                Reorder chronologically
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TimeEntry({
  seconds,
  onAssign,
  onError,
}: {
  seconds: number | null;
  onAssign: (seconds: number) => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState(seconds === null ? '' : formatTimeOffsetSeconds(seconds));
  function apply() {
    if (!/^\d+:[0-5]\d$/.test(value.trim())) {
      onError('Enter a time as minutes:seconds, for example 2:05.');
      return;
    }
    const [minutes, seconds] = value.trim().split(':').map(Number);
    onAssign(minutes * 60 + seconds);
  }
  return (
    <div className={styles.manualTime}>
      <label>
        Time (mm:ss)
        <input
          value={value}
          placeholder="2:05"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            }
          }}
        />
      </label>
      <button type="button" className={formStyles.seekBtn} onClick={apply}>
        Assign time
      </button>
    </div>
  );
}
