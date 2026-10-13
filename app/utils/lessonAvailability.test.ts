import { getLessonAvailability } from './lessonAvailability';

const now = new Date('2026-10-12T12:00:00Z');
const yesterday = new Date('2026-10-11T12:00:00Z');
const tomorrow = new Date('2026-10-13T12:00:00Z');

describe('getLessonAvailability', () => {
  it('is open with no dates', () => {
    expect(getLessonAvailability({ openDate: null, dueDate: null, accessibleAfterDue: false }, now)).toEqual({
      isUpcoming: false,
      isPastDue: false,
      isClosed: false,
      isOpen: true,
    });
  });

  it('is upcoming before the open date', () => {
    expect(getLessonAvailability({ openDate: tomorrow, dueDate: null, accessibleAfterDue: false }, now)).toMatchObject({
      isUpcoming: true,
      isOpen: false,
    });
  });

  it('is closed after the due date without late access', () => {
    expect(
      getLessonAvailability({ openDate: yesterday, dueDate: yesterday, accessibleAfterDue: false }, now)
    ).toMatchObject({ isPastDue: true, isClosed: true, isOpen: false });
  });

  it('stays open after the due date when late access is allowed', () => {
    expect(getLessonAvailability({ openDate: null, dueDate: yesterday, accessibleAfterDue: true }, now)).toMatchObject({
      isPastDue: true,
      isClosed: false,
      isOpen: true,
    });
  });
});
