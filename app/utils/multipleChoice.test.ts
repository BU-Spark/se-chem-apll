import { areIndexSetsEqual, getMultipleChoiceChoices, validateMultipleChoiceAnswers } from './multipleChoice';

describe('multiple-choice helpers', () => {
  it('reads legacy and object choice formats', () => {
    expect(getMultipleChoiceChoices(['A', 'B'])).toEqual(['A', 'B']);
    expect(getMultipleChoiceChoices({ type: 'multipleChoice', choices: ['A', 'B'] })).toEqual(['A', 'B']);
    expect(getMultipleChoiceChoices({ type: 'shortAnswer' })).toBeNull();
  });

  it('accepts multiple unique correct answers', () => {
    expect(
      validateMultipleChoiceAnswers([
        {
          options: { type: 'multipleChoice', choices: ['A', 'B', 'C'] },
          correctIndices: [0, 2],
        },
      ])
    ).toBeNull();
  });

  it('requires at least one correct answer', () => {
    expect(validateMultipleChoiceAnswers([{ options: ['A', 'B'], correctIndices: [] }])).toBe(
      'Each multiple-choice question must have at least one correct answer.'
    );
  });

  it('requires between two and eight choices', () => {
    expect(validateMultipleChoiceAnswers([{ options: ['A'], correctIndices: [0] }])).toBe(
      'Multiple-choice questions must have between two and eight choices.'
    );
    expect(
      validateMultipleChoiceAnswers([{ options: ['1', '2', '3', '4', '5', '6', '7', '8'], correctIndices: [0, 7] }])
    ).toBeNull();
    expect(
      validateMultipleChoiceAnswers([{ options: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], correctIndices: [0] }])
    ).toBe('Multiple-choice questions must have between two and eight choices.');
  });

  it.each([[0, 0], [-1], [2], [1.5]])('rejects invalid correct indexes %p', (...correctIndices) => {
    const error = validateMultipleChoiceAnswers([{ options: ['A', 'B'], correctIndices }]);
    expect(error).not.toBeNull();
  });

  it('compares answer sets without considering order', () => {
    expect(areIndexSetsEqual([0, 2], [2, 0])).toBe(true);
    expect(areIndexSetsEqual([0, 2], [0])).toBe(false);
    expect(areIndexSetsEqual([0, 2], [0, 1, 2])).toBe(false);
    expect(areIndexSetsEqual([0, 2], [0, 0])).toBe(false);
  });
});
