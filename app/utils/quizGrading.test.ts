import { gradeQuizAttempt, isNumberAnswer, validateQuizAnswers } from './quizGrading';

const singleChoice = {
  id: 'mc1',
  options: { type: 'multipleChoice', choices: ['A', 'B', 'C'] },
  correctIndices: [1],
};
const multiChoice = { id: 'mc2', options: ['A', 'B', 'C'], correctIndices: [0, 2] };
const exact = {
  id: 'sa1',
  options: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 42 },
  correctIndices: [],
};
const range = {
  id: 'sa2',
  options: { type: 'shortAnswer', answerMode: 'range', minimumAnswer: 6.5, maximumAnswer: 7.5 },
  correctIndices: [],
};

describe('isNumberAnswer', () => {
  it.each(['7', ' -0.5 ', '6.02e23'])('accepts %p', (text) => expect(isNumberAnswer(text)).toBe(true));
  it.each(['', '  ', 'seven', '7 apples', 'Infinity'])('rejects %p', (text) =>
    expect(isNumberAnswer(text)).toBe(false)
  );
});

describe('validateQuizAnswers', () => {
  it('accepts a complete submission', () => {
    expect(
      validateQuizAnswers(
        [singleChoice, exact],
        [
          { questionId: 'mc1', selectedIndices: [0] },
          { questionId: 'sa1', rawAnswer: '41' },
        ]
      )
    ).toBeNull();
  });

  it('rejects an unanswered multiple-choice question', () => {
    expect(validateQuizAnswers([singleChoice], [{ questionId: 'mc1', selectedIndices: [] }])).toBe(
      'Every question must be answered.'
    );
  });

  it('rejects a short answer that is not a number', () => {
    expect(validateQuizAnswers([exact], [{ questionId: 'sa1', rawAnswer: 'seven' }])).toBe(
      'Short answers must be numbers.'
    );
  });
});

describe('gradeQuizAttempt', () => {
  it('grades every question type with the existing utilities', () => {
    const result = gradeQuizAttempt(
      [singleChoice, multiChoice, exact, range],
      [
        { questionId: 'mc1', selectedIndices: [1] },
        { questionId: 'mc2', selectedIndices: [2, 0] },
        { questionId: 'sa1', rawAnswer: '42' },
        { questionId: 'sa2', rawAnswer: '7.1' },
      ],
      70
    );
    expect(result.responses.map((response) => response.isCorrect)).toEqual([true, true, true, true]);
    expect(result).toMatchObject({ score: 100, isPassing: true });
  });

  it('grades multi-answer questions all-or-nothing', () => {
    const result = gradeQuizAttempt([multiChoice], [{ questionId: 'mc2', selectedIndices: [0] }], 0);
    expect(result.responses[0].isCorrect).toBe(false);
  });

  it('treats passingPercent as an inclusive threshold', () => {
    const answers = [
      { questionId: 'mc1', selectedIndices: [1] },
      { questionId: 'sa1', rawAnswer: '0' },
    ];
    expect(gradeQuizAttempt([singleChoice, exact], answers, 50)).toMatchObject({ score: 50, isPassing: true });
    expect(gradeQuizAttempt([singleChoice, exact], answers, 51)).toMatchObject({ score: 50, isPassing: false });
  });

  it('records what the student answered', () => {
    const result = gradeQuizAttempt(
      [singleChoice, exact],
      [
        { questionId: 'mc1', selectedIndices: [2] },
        { questionId: 'sa1', rawAnswer: ' 41 ' },
      ],
      70
    );
    expect(result.responses).toEqual([
      { questionId: 'mc1', selectedIndices: [2], rawAnswer: null, isCorrect: false },
      { questionId: 'sa1', selectedIndices: [], rawAnswer: '41', isCorrect: false },
    ]);
  });

  it('rounds the score to two decimals', () => {
    const result = gradeQuizAttempt(
      [singleChoice, multiChoice, exact],
      [{ questionId: 'mc1', selectedIndices: [1] }],
      33
    );
    expect(result.score).toBe(33.33);
  });
});
