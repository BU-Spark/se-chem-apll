const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  dateStyle: 'medium',
  timeStyle: 'long',
});

export function updatedLabel(timestamp: number, now: number): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 3_600_000) return 'Less than an hour ago';
  if (elapsed < 86_400_000) {
    const hours = Math.floor(elapsed / 3_600_000);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  return dateFormatter.format(timestamp);
}

export function updatedTooltip(timestamp: number): string {
  return timestampFormatter.format(timestamp);
}
