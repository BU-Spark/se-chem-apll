interface LessonSchedule {
  openDate: Date | null;
  dueDate: Date | null;
  accessibleAfterDue: boolean;
}

// Single source of truth for whether a course lesson can be worked on right now.
export function getLessonAvailability({ openDate, dueDate, accessibleAfterDue }: LessonSchedule, now = new Date()) {
  const isUpcoming = openDate !== null && now < openDate;
  const isPastDue = dueDate !== null && now > dueDate;
  const isClosed = isPastDue && !accessibleAfterDue;
  return { isUpcoming, isPastDue, isClosed, isOpen: !isUpcoming && !isClosed };
}
