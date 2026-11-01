import { gradeAnswer, lessonGrade } from './grading';
const policy = {
  openDate: null,
  dueDate: new Date('2026-01-01T12:00Z'),
  lateDeadline: new Date('2026-01-03T12:00Z'),
  hideAfterDue: false,
  latePenaltyType: 'HOURLY' as const,
  latePenaltyPercent: 2,
};
it('weights quiz percentages equally and prorates penalties without rounding', () => {
  expect(lessonGrade([60, 100], policy, new Date('2026-01-01T15:00Z'))).toEqual({
    rawPercent: 80,
    penaltyPercent: 6,
    finalPercent: 75.19999999999999,
  });
  expect(lessonGrade([0, 100], policy, new Date('2026-01-01T12:30Z')).finalPercent).toBe(49.5);
});
it('accepts exact boundaries and rejects times outside the window', () => {
  expect(lessonGrade([100], policy, policy.dueDate).finalPercent).toBe(100);
  expect(() => lessonGrade([100], policy, policy.lateDeadline)).not.toThrow();
  expect(() => lessonGrade([100], policy, new Date(policy.lateDeadline.getTime() + 1))).toThrow();
  expect(() =>
    lessonGrade([100], { ...policy, openDate: policy.dueDate }, new Date(policy.dueDate.getTime() - 1))
  ).toThrow();
});
it('caps deductions, preserves zero and supports completion-only work', () => {
  expect(lessonGrade([80], { ...policy, latePenaltyPercent: 100 }, policy.lateDeadline).finalPercent).toBe(0);
  expect(lessonGrade([0], policy, policy.dueDate).finalPercent).toBe(0);
  expect(lessonGrade([], policy, policy.dueDate)).toEqual({ rawPercent: null, penaltyPercent: 0, finalPercent: null });
});
it('grades MC sets and numeric answers server-side', () => {
  expect(
    gradeAnswer(
      { id: 'q', prompt: '', options: ['A', 'B'], correctIndices: [1] },
      { questionId: 'q', selectedIndices: [0] }
    )
  ).toBe(false);
  expect(
    gradeAnswer(
      {
        id: 'q',
        prompt: '',
        options: { type: 'shortAnswer', answerMode: 'range', minimumAnswer: 1, maximumAnswer: 2 },
        correctIndices: [],
      },
      { questionId: 'q', rawAnswer: '1.5' }
    )
  ).toBe(true);
  expect(() =>
    gradeAnswer(
      { id: 'q', prompt: '', options: ['A', 'B'], correctIndices: [1] },
      { questionId: 'q', selectedIndices: [5] }
    )
  ).toThrow();
});
