import { openDateDelta, shiftLessonSchedule } from './shiftLessonSchedule';
import { emptyLessonSchedule } from './lessonSubmissionPolicy';

const rows = [
  {
    ...emptyLessonSchedule,
    lessonId: 'a',
    title: 'A',
    openDate: '2026-03-07T12:00:00.123',
    dueDate: '2026-03-09T12:00',
    lateDeadline: '2026-03-10T12:00',
  },
  { ...emptyLessonSchedule, lessonId: 'b', title: 'B', openDate: '', dueDate: '2026-03-15T12:00' },
];
it('shifts every populated date exactly once in UTC across daylight savings, preserving blanks and policies', () => {
  const shifted = shiftLessonSchedule(rows, openDateDelta(rows[0].openDate, '2026-03-08T12:00:00.123')!);
  expect(shifted[0]).toMatchObject({
    openDate: '2026-03-08T12:00:00.123',
    dueDate: '2026-03-10T12:00:00.000',
    lateDeadline: '2026-03-11T12:00:00.000',
  });
  expect(shifted[1]).toMatchObject({
    openDate: '',
    dueDate: '2026-03-16T12:00:00.000',
    lateDeadline: '',
    latePenaltyType: 'NONE',
  });
  expect(rows[0].openDate).toBe('2026-03-07T12:00:00.123');
});
it('supports backward shifts across years', () => {
  expect(shiftLessonSchedule([{ ...rows[0], openDate: '2026-01-01T00:00' }], -86400000)[0].openDate).toBe(
    '2025-12-31T00:00:00.000'
  );
});
it.each([
  ['', '2026-01-01T12:00'],
  ['2026-01-01T12:00', ''],
  ['invalid', '2026-01-01T12:00'],
  ['2026-01-01T12:00', '2026-01-01T12:00'],
])('does not propose a shift without two distinct valid dates', (before, after) => {
  expect(openDateDelta(before, after)).toBeNull();
});
