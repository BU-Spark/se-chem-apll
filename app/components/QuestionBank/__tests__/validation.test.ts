import { countIssuesBySeverity, validateQuestion, validateQuestionBank } from '../validation';
import {
  makeChoice,
  makeMultipleChoiceQuestion,
  makeShortAnswerQuestion,
  type MultipleChoiceQuestion,
  type ShortAnswerQuestion,
} from '../types';

function validMc(): MultipleChoiceQuestion {
  return {
    ...makeMultipleChoiceQuestion('q1'),
    prompt: 'What is 2+2?',
    choices: [makeChoice('3', false, 'c1'), makeChoice('4', true, 'c2')],
  };
}

describe('validateQuestion', () => {
  it('returns no issues for a valid multiple-choice question', () => {
    expect(validateQuestion(validMc())).toEqual([]);
  });

  it('requires a prompt', () => {
    const issues = validateQuestion({ ...validMc(), prompt: '   ' });
    expect(issues).toEqual([expect.objectContaining({ severity: 'error', code: 'PROMPT_REQUIRED', field: 'prompt' })]);
  });

  it('requires at least two choices and rejects empty choice text', () => {
    const tooFew = validateQuestion({ ...validMc(), choices: [makeChoice('only', true, 'c1')] });
    expect(tooFew.some((i) => i.code === 'MC_CHOICE_COUNT')).toBe(true);

    const empty = validateQuestion({
      ...validMc(),
      choices: [makeChoice('A', true, 'c1'), makeChoice('  ', false, 'c2')],
    });
    expect(empty.some((i) => i.code === 'MC_CHOICE_EMPTY' && i.field === 'choice:c2')).toBe(true);
  });

  it('requires at least one correct choice', () => {
    const issues = validateQuestion({
      ...validMc(),
      choices: [makeChoice('A', false, 'c1'), makeChoice('B', false, 'c2')],
    });
    expect(issues.some((i) => i.code === 'MC_NO_CORRECT')).toBe(true);
  });

  it('warns on duplicate choices without blocking', () => {
    const issues = validateQuestion({
      ...validMc(),
      choices: [makeChoice('Same', true, 'c1'), makeChoice(' same ', false, 'c2')],
    });
    expect(issues).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'MC_DUPLICATE_CHOICE', field: 'choice:c2' }),
    ]);
  });

  it('validates exact short answers', () => {
    const valid: ShortAnswerQuestion = {
      ...makeShortAnswerQuestion('q2'),
      prompt: 'Sqrt of 16?',
      answer: { mode: 'exact', expected: '4' },
    };
    expect(validateQuestion(valid)).toEqual([]);

    const invalid = validateQuestion({ ...valid, answer: { mode: 'exact', expected: 'abc' } });
    expect(invalid.some((i) => i.code === 'SA_EXPECTED_INVALID' && i.field === 'answer')).toBe(true);

    const empty = validateQuestion({ ...valid, answer: { mode: 'exact', expected: '' } });
    expect(empty.some((i) => i.code === 'SA_EXPECTED_INVALID')).toBe(true);
  });

  it('validates range short answers', () => {
    const valid: ShortAnswerQuestion = {
      ...makeShortAnswerQuestion('q3'),
      prompt: 'Estimate pi',
      answer: { mode: 'range', minimum: '3.1', maximum: '3.2' },
    };
    expect(validateQuestion(valid)).toEqual([]);

    const inverted = validateQuestion({ ...valid, answer: { mode: 'range', minimum: '3.2', maximum: '3.1' } });
    expect(inverted.some((i) => i.code === 'SA_RANGE_ORDER')).toBe(true);

    const partial = validateQuestion({ ...valid, answer: { mode: 'range', minimum: '', maximum: '3.2' } });
    expect(partial.some((i) => i.code === 'SA_RANGE_INVALID')).toBe(true);
  });

  it('accepts scientific notation as finite numbers', () => {
    const q: ShortAnswerQuestion = {
      ...makeShortAnswerQuestion('q4'),
      prompt: 'Avogadro?',
      answer: { mode: 'exact', expected: '6.022e23' },
    };
    expect(validateQuestion(q)).toEqual([]);
  });
});

describe('validateQuestionBank / countIssuesBySeverity', () => {
  it('keys issues by question id and counts severities', () => {
    const bad = validMc();
    bad.prompt = '';
    const map = validateQuestionBank([validMc(), bad]);
    expect(map.size).toBe(1);
    expect(map.get(bad.id)?.[0].code).toBe('PROMPT_REQUIRED');

    const counts = countIssuesBySeverity(map);
    expect(counts).toEqual({ errors: 1, warnings: 0 });
  });
});
