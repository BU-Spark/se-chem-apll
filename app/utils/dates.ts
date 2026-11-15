// Dates as "Nov 7", in Boston time (where the course runs) so a late-evening due date isn't a day off.
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

export const formatDay = (date: Date) => dayFormat.format(date);
