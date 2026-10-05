import { authoringQuestionToPayload, dbQuestionToAuthoring, summarizeAnswer } from '../adapters';
import { makeChoice, makeMultipleChoiceQuestion, makeShortAnswerQuestion } from '../types';

describe('dbQuestionToAuthoring', () => {
  it('converts a multiple-choice record with correct flags', () => {
    const q = dbQuestionToAuthoring({
      id: 'q1',
      prompt: 'Pick',
      options: { type: 'multipleChoice', choices: ['A', 'B', 'C'] },
      correctIndices: [0, 2],
    });
    expect(q.type).toBe('multipleChoice');
    if (q.type === 'multipleChoice') {
      expect(q.choices.map((c) => c.content)).toEqual(['A', 'B', 'C']);
      expect(q.choices.map((c) => c.correct)).toEqual([true, false, true]);
    }
  });

  it('converts legacy string-array options', () => {
    const q = dbQuestionToAuthoring({ id: 'q1', prompt: 'Pick', options: ['A', 'B'], correctIndices: [1] });
    expect(q.type).toBe('multipleChoice');
    if (q.type === 'multipleChoice') {
      expect(q.choices.map((c) => c.correct)).toEqual([false, true]);
    }
  });

  it('converts exact and range short answers', () => {
    const exact = dbQuestionToAuthoring({
      id: 'q1',
      prompt: 'Exact',
      options: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 4 },
      correctIndices: [],
    });
    expect(exact).toMatchObject({ type: 'shortAnswer', answer: { mode: 'exact', expected: '4' } });

    const range = dbQuestionToAuthoring({
      id: 'q2',
      prompt: 'Range',
      options: { type: 'shortAnswer', answerMode: 'range', minimumAnswer: 3.1, maximumAnswer: 3.2 },
      correctIndices: [],
    });
    expect(range).toMatchObject({ type: 'shortAnswer', answer: { mode: 'range', minimum: '3.1', maximum: '3.2' } });
  });
});

describe('authoringQuestionToPayload', () => {
  it('serializes multiple choice to legacy options JSON and correctIndices', () => {
    const q = {
      ...makeMultipleChoiceQuestion('q1'),
      prompt: 'Pick',
      choices: [makeChoice('A', true, 'c1'), makeChoice('B', false, 'c2'), makeChoice('C', true, 'c3')],
    };
    expect(authoringQuestionToPayload(q, 3)).toEqual({
      sortOrder: 3,
      prompt: 'Pick',
      options: { type: 'multipleChoice', choices: ['A', 'B', 'C'] },
      correctIndices: [0, 2],
    });
  });

  it('serializes exact and range short answers with numeric values', () => {
    const exact = { ...makeShortAnswerQuestion('q1'), prompt: 'E', answer: { mode: 'exact' as const, expected: '4' } };
    expect(authoringQuestionToPayload(exact, 0)).toEqual({
      sortOrder: 0,
      prompt: 'E',
      options: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 4 },
      correctIndices: [],
    });

    const range = {
      ...makeShortAnswerQuestion('q2'),
      prompt: 'R',
      answer: { mode: 'range' as const, minimum: '1', maximum: '2' },
    };
    expect(authoringQuestionToPayload(range, 1).options).toEqual({
      type: 'shortAnswer',
      answerMode: 'range',
      minimumAnswer: 1,
      maximumAnswer: 2,
    });
  });

  it('round-trips through the db adapter', () => {
    const original = {
      ...makeMultipleChoiceQuestion('q1'),
      prompt: 'Round trip',
      choices: [makeChoice('A', true, 'c1'), makeChoice('B', false, 'c2')],
    };
    const payload = authoringQuestionToPayload(original, 0);
    const back = dbQuestionToAuthoring({
      id: 'q1',
      prompt: payload.prompt,
      options: payload.options,
      correctIndices: [0],
    });
    expect(back.type).toBe('multipleChoice');
    if (back.type === 'multipleChoice') {
      expect(back.choices.map((c) => c.content)).toEqual(['A', 'B']);
      expect(back.choices.map((c) => c.correct)).toEqual([true, false]);
    }
  });
});

describe('summarizeAnswer', () => {
  it('summarizes multiple choice', () => {
    const q = {
      ...makeMultipleChoiceQuestion('q1'),
      choices: [makeChoice('A', true, 'c1'), makeChoice('B', false, 'c2'), makeChoice('C', true, 'c3')],
    };
    expect(summarizeAnswer(q)).toBe('3 choices · 2 correct');
  });

  it('summarizes exact and range answers', () => {
    expect(summarizeAnswer({ ...makeShortAnswerQuestion('q1'), answer: { mode: 'exact', expected: '42' } })).toBe(
      'Exact: 42'
    );
    expect(
      summarizeAnswer({ ...makeShortAnswerQuestion('q2'), answer: { mode: 'range', minimum: '1', maximum: '2' } })
    ).toBe('Range: 1 – 2');
    expect(summarizeAnswer({ ...makeShortAnswerQuestion('q3'), answer: { mode: 'exact', expected: '' } })).toBe(
      'Exact: —'
    );
  });
});
