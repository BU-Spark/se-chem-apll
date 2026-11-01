import Papa from 'papaparse';
import { authoringQuestionToPayload, dbQuestionToAuthoring } from '@/app/components/QuestionBank/adapters';
import { duplicateQuestion, makeMultipleChoiceQuestion } from '@/app/components/QuestionBank/types';
import { dbQuestionToForm } from '@/app/components/NodeForm/types';
import { csvToQuestions, questionsToCsv, sampleQuestionBankCsv } from './questionBankCsv';
import { csvToCheckpoints, checkpointsToCsv, sampleCheckpointCsv } from './checkpointCsv';
import {
  questionContentKey,
  serializeQuestionCreate,
  serializeCheckpointQuestionCreate,
  validateNodeContent,
} from './nodeContent';

const feedback = {
  feedbackCorrect: '=Correct, **well done**!\nUse $\\ce{H2O}$.',
  feedbackIncorrect: '@Try again: "check the units".',
};

function omitColumns(text: string, omitted: string[]) {
  const rows = Papa.parse<string[]>(text).data;
  const indices = rows[0].flatMap((header, index) => (omitted.includes(header) ? [] : [index]));
  return Papa.unparse(rows.map((row) => indices.map((index) => row[index])));
}

describe('optional question feedback', () => {
  it.each([['feedback_correct', 'feedback_incorrect'], ['feedback_correct'], ['feedback_incorrect']])(
    'accepts older CSV files and independently optional columns: %j',
    (...omitted) => {
      const quiz = csvToQuestions(omitColumns(sampleQuestionBankCsv(), omitted));
      const checkpoints = csvToCheckpoints(omitColumns(sampleCheckpointCsv(), omitted));
      expect(quiz.errors).toEqual([]);
      expect(checkpoints.errors).toEqual([]);
      if (omitted.includes('feedback_correct')) {
        expect(quiz.questions[0].feedbackCorrect).toBe('');
        expect(checkpoints.checkpoints[0].questions[0].feedbackCorrect).toBe('');
      } else {
        expect(quiz.questions[0].feedbackCorrect).toContain('Correct!');
        expect(checkpoints.checkpoints[0].questions[0].feedbackCorrect).toContain('Correct!');
      }
      if (omitted.includes('feedback_incorrect')) expect(quiz.questions[0].feedbackIncorrect).toBe('');
      else expect(quiz.questions[0].feedbackIncorrect).toBe('Try adding two pairs together.');
    }
  );

  it('round trips feedback through CSV, database payloads, reload, duplication and export for every question type', () => {
    const originals = csvToQuestions(sampleQuestionBankCsv()).questions.map((q) => ({ ...q, ...feedback }));
    const imported = csvToQuestions(questionsToCsv(originals));
    expect(imported.errors).toEqual([]);
    const reloaded = imported.questions.map((q) => {
      const payload = authoringQuestionToPayload(q, 0);
      expect(serializeQuestionCreate(payload)).toMatchObject(feedback);
      const restored = dbQuestionToAuthoring({
        ...payload,
        id: q.id,
        correctIndices: payload.correctIndices as number[],
      });
      expect(restored).toMatchObject(feedback);
      expect(duplicateQuestion(restored)).toMatchObject(feedback);
      return restored;
    });
    expect(questionsToCsv(reloaded)).toBe(questionsToCsv(originals));
    expect(questionsToCsv(reloaded)).toContain("'=Correct");
    expect(questionsToCsv(reloaded)).toContain("'@Try");
  });

  it('round trips checkpoint questions and leaves note feedback blank', () => {
    const checkpoints = csvToCheckpoints(sampleCheckpointCsv()).checkpoints.map((c) => ({
      ...c,
      questions: c.questions.map((q) => (q.questionType === 'note' ? q : { ...q, ...feedback })),
    }));
    const exported = checkpointsToCsv(checkpoints);
    const imported = csvToCheckpoints(exported);
    expect(imported.errors).toEqual([]);
    for (const q of imported.checkpoints.flatMap((c) => c.questions)) {
      if (q.questionType === 'note') {
        expect(q.feedbackCorrect).toBeUndefined();
      } else {
        expect(q).toMatchObject(feedback);
        const payload = serializeCheckpointQuestionCreate({
          sortOrder: 0,
          prompt: q.prompt,
          ...feedback,
          options: { type: 'multipleChoice', choices: ['A', 'B'] },
          correctIndices: [0],
        });
        expect(dbQuestionToForm({ ...payload, id: 'saved' })).toMatchObject(feedback);
      }
    }
    expect(checkpointsToCsv(imported.checkpoints)).toBe(exported);
    const rows = Papa.parse<string[]>(exported).data;
    expect(rows.every((row) => row.length === rows[0].length)).toBe(true);
  });

  it('rejects conflicting variant feedback without discarding other valid questions', () => {
    const rows = Papa.parse<string[]>(sampleQuestionBankCsv()).data;
    rows[6][rows[0].indexOf('feedback_incorrect')] = 'Different feedback';
    const result = csvToQuestions(Papa.unparse(rows));
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 7, message: expect.stringContaining('same feedback') }),
    ]);
    expect(result.questions).toHaveLength(5);
    expect(result.questions.some((q) => q.prompt.includes('How many moles'))).toBe(false);
  });

  it('rejects feedback on checkpoint notes', () => {
    const rows = Papa.parse<string[]>(sampleCheckpointCsv()).data;
    rows[3][rows[0].indexOf('feedback_correct')] = 'Not applicable';
    expect(csvToCheckpoints(Papa.unparse(rows)).errors[0].message).toMatch(/notes must leave answer fields blank/);
  });

  it.each(['draft', 'publish'] as const)('validates feedback types in %s saves', (mode) => {
    const payload = authoringQuestionToPayload(makeMultipleChoiceQuestion(), 0);
    expect(
      validateNodeContent({ quizQuestions: [{ ...payload, feedbackCorrect: 123 as unknown as string }] }, mode)
    ).toMatch(/feedbackCorrect must be text/);
    expect(
      validateNodeContent(
        {
          checkpoints: [{ sortOrder: 0, timeOffsetSeconds: 0, questions: [{ ...payload, kind: 'note', ...feedback }] }],
        },
        mode
      )
    ).toMatch(/Notes cannot include answer feedback/);
  });

  it('normalizes empty feedback and detects feedback-only edits including variants', () => {
    for (const question of csvToQuestions(sampleQuestionBankCsv()).questions) {
      const payload = authoringQuestionToPayload(question, 0);
      const empty = { ...payload, feedbackCorrect: null, feedbackIncorrect: '' };
      const whitespace = { ...payload, feedbackCorrect: '   ', feedbackIncorrect: '\n' };
      expect(questionContentKey(empty)).toBe(questionContentKey(whitespace));
      expect(questionContentKey({ ...payload, ...feedback })).not.toBe(questionContentKey(empty));
      expect(serializeQuestionCreate(whitespace)).toMatchObject({ feedbackCorrect: null, feedbackIncorrect: null });
      expect(serializeQuestionCreate({ ...payload, ...feedback })).toMatchObject(feedback);
    }
  });
});
