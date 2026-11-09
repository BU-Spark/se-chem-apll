'use client';

import { useSyncExternalStore } from 'react';

const dateOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
} satisfies Intl.DateTimeFormatOptions;
const utcFormat = new Intl.DateTimeFormat('en-US', { ...dateOptions, timeZone: 'UTC' });

const subscribe = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => 'UTC';

export default function DeadlineTime({ isoDate }: { isoDate: string }) {
  // Use UTC for the server render and initial hydration, then read the browser's time zone.
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, serverTimeZone);
  const date = new Date(isoDate);
  const utc = <time dateTime={isoDate}>{utcFormat.format(date)}</time>;
  if (timeZone === 'UTC') return utc;

  const local = new Intl.DateTimeFormat('en-US', { ...dateOptions, timeZone }).format(date);
  return (
    <>
      <time dateTime={isoDate}>{local}</time> ({utc})
    </>
  );
}
