import { updatedLabel, updatedTooltip } from './updatedLabel';
const now = Date.parse('2026-10-13T12:00:00Z');
it.each([
  [0, 'Less than an hour ago'],
  [3_599_999, 'Less than an hour ago'],
  [3_600_000, '1 hour ago'],
  [7_200_000, '2 hours ago'],
  [86_399_999, '23 hours ago'],
  [86_400_000, 'Oct 12, 2026'],
  [172_800_000, 'Oct 11, 2026'],
  [-1000, 'Less than an hour ago'],
])('formats an elapsed time of %i milliseconds', (elapsed, expected) => {
  expect(updatedLabel(now - elapsed, now)).toBe(expected);
});
it('includes exact time and UTC in the tooltip', () => {
  expect(updatedTooltip(now)).toContain('12:00:00');
  expect(updatedTooltip(now)).toContain('UTC');
});
