import { toStudentQuizQuestion } from './studentQuizQuestion';

describe('toStudentQuizQuestion', () => {
  it('keeps choices but hides which ones are correct', () => {
    const result = toStudentQuizQuestion({
      id: 'q1',
      prompt: 'Pick two',
      options: { type: 'multipleChoice', choices: ['A', 'B', 'C'] },
      correctIndices: [0, 2],
    });

    expect(result).toEqual({
      id: 'q1',
      prompt: 'Pick two',
      type: 'multipleChoice',
      choices: ['A', 'B', 'C'],
      allowsMultiple: true,
    });
    expect(JSON.stringify(result)).not.toContain('correctIndices');
  });

  it('supports the legacy string-array choice format', () => {
    expect(
      toStudentQuizQuestion({ id: 'q1', prompt: 'Pick one', options: ['Yes', 'No'], correctIndices: [1] })
    ).toMatchObject({ type: 'multipleChoice', choices: ['Yes', 'No'], allowsMultiple: false });
  });

  it('hides expected values for short-answer questions', () => {
    const result = toStudentQuizQuestion({
      id: 'q2',
      prompt: 'pH of water?',
      options: { type: 'shortAnswer', answerMode: 'range', minimumAnswer: 6.5, maximumAnswer: 7.5 },
      correctIndices: [],
    });

    expect(result).toEqual({ id: 'q2', prompt: 'pH of water?', type: 'shortAnswer' });
  });

  it('returns null for unsupported formats', () => {
    expect(toStudentQuizQuestion({ id: 'q3', prompt: '?', options: { type: 'essay' }, correctIndices: [] })).toBeNull();
  });
});
