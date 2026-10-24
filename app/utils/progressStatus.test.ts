import { PROGRESS_LABELS, statusFromPercent } from './progressStatus';

describe('statusFromPercent', () => {
  it.each([
    [0, 'NOT_STARTED'],
    [42, 'IN_PROGRESS'],
    [100, 'COMPLETED'],
  ])('treats %p%% as %p', (percent, status) => {
    expect(statusFromPercent(percent)).toBe(status);
  });
});

describe('PROGRESS_LABELS', () => {
  it('has a student-facing label for every status', () => {
    expect(PROGRESS_LABELS).toEqual({ NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' });
  });
});
