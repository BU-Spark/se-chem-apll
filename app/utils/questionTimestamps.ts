export interface TimestampParts {
  minutes: string;
  seconds: string;
}

export interface CheckpointTimestampInput {
  timeOffsetSeconds?: unknown;
}

export function validateTimestampParts(minutes: string, seconds: string): string | null {
  const trimmedMinutes = minutes.trim();
  const trimmedSeconds = seconds.trim();

  if (trimmedMinutes === '' && trimmedSeconds === '') return null;
  if (trimmedMinutes === '' || trimmedSeconds === '') {
    return 'Enter both minutes and seconds, or leave both blank.';
  }

  const minuteValue = Number(trimmedMinutes);
  const secondValue = Number(trimmedSeconds);
  if (
    !Number.isInteger(minuteValue) ||
    !Number.isInteger(secondValue) ||
    minuteValue < 0 ||
    secondValue < 0 ||
    secondValue > 59
  ) {
    return 'Timestamp minutes must be non-negative whole numbers and seconds must be between 0 and 59.';
  }

  return null;
}

export function combineTimestampParts(minutes: string, seconds: string): number | null {
  if (validateTimestampParts(minutes, seconds)) return null;
  if (minutes.trim() === '' && seconds.trim() === '') return null;

  const minuteValue = Number(minutes);
  const secondValue = Number(seconds);
  return minuteValue * 60 + secondValue;
}

export function splitTimeOffsetSeconds(timeOffsetSeconds: number | null | undefined): TimestampParts {
  if (timeOffsetSeconds == null || !Number.isInteger(timeOffsetSeconds) || timeOffsetSeconds < 0) {
    return { minutes: '', seconds: '' };
  }

  return {
    minutes: String(Math.floor(timeOffsetSeconds / 60)),
    seconds: String(timeOffsetSeconds % 60),
  };
}

export function formatTimeOffsetSeconds(timeOffsetSeconds: number): string {
  const minutes = Math.floor(timeOffsetSeconds / 60);
  const seconds = timeOffsetSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Checkpoint timestamps are required, non-negative integers, and unique per node. */
export function validateCheckpointTimestamps(checkpoints: CheckpointTimestampInput[]): string | null {
  const seen = new Set<number>();

  for (const checkpoint of checkpoints) {
    const timestamp = checkpoint.timeOffsetSeconds;
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp) || timestamp < 0) {
      return 'Each checkpoint must have a non-negative whole-second timestamp.';
    }
    if (seen.has(timestamp)) {
      return 'Checkpoint timestamps must be unique within a node.';
    }
    seen.add(timestamp);
  }

  return null;
}
