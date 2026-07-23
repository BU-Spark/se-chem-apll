export interface TimestampedQuestionInput {
  isPreLecture?: boolean;
  timeOffsetSeconds?: unknown;
}

export interface TimestampParts {
  minutes: string;
  seconds: string;
}

export function combineTimestampParts(minutes: string, seconds: string): number | null {
  if (minutes.trim() === '' || seconds.trim() === '') return null;

  const minuteValue = Number(minutes);
  const secondValue = Number(seconds);
  if (
    !Number.isInteger(minuteValue) ||
    !Number.isInteger(secondValue) ||
    minuteValue < 0 ||
    secondValue < 0 ||
    secondValue > 59
  ) {
    return null;
  }

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

export function validateQuestionTimestamps(questions: TimestampedQuestionInput[]): string | null {
  const seenTimestamps = new Set<number>();

  for (const question of questions) {
    if (question.isPreLecture) continue;

    const timestamp = question.timeOffsetSeconds;
    if (timestamp == null) {
      return 'Each checkpoint question must have a timestamp.';
    }
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp) || timestamp < 0) {
      return 'Checkpoint timestamps must be non-negative whole seconds.';
    }
    if (seenTimestamps.has(timestamp)) {
      return 'Checkpoint timestamps must be unique.';
    }

    seenTimestamps.add(timestamp);
  }

  return null;
}
