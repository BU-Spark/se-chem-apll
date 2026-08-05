export interface TimestampedQuestionInput {
  isPreLecture?: boolean;
  timeOffsetSeconds?: unknown;
}

export interface TimestampParts {
  minutes: string;
  seconds: string;
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

export function validateQuestionTimestamps(questions: TimestampedQuestionInput[]): string | null {
  for (const question of questions) {
    if (question.isPreLecture !== undefined && typeof question.isPreLecture !== 'boolean') {
      return 'Checkpoint timestamps must be non-negative whole seconds.';
    }
    if (question.isPreLecture === true) continue;

    const timestamp = question.timeOffsetSeconds;
    if (timestamp == null) continue;
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp) || timestamp < 0) {
      return 'Checkpoint timestamps must be non-negative whole seconds.';
    }
  }

  return null;
}
