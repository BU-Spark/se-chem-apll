/** @jest-environment node */
import {
  quizVariantOptions,
  resolveQuizVariant,
  validateQuizVariants,
  type MultipleChoiceVariantOptions,
} from './questionVariants';
import { questionContentKey, serializeQuestionCreate, validateNodeContent } from './nodeContent';
import { authoringQuestionToPayload, dbQuestionToAuthoring } from '@/app/components/QuestionBank/adapters';
import { duplicateQuestion } from '@/app/components/QuestionBank/types';
import { gradeAnswer } from '@/lib/submissions/grading';
import { csvToQuestions, questionsToCsv } from './questionBankCsv';

const options: MultipleChoiceVariantOptions = {
  type: 'variantMultipleChoice',
  version: 2,
  variants: [
    {
      id: 'one',
      values: { first: '2', second: '3' },
      answer: {
        type: 'multipleChoice',
        choices: [
          { id: 'a', content: '{{first}}' },
          { id: 'b', content: '{{second}}' },
          { id: 'c', content: 'Neither' },
        ],
        correctChoiceIds: ['a'],
      },
    },
    {
      id: 'two',
      values: { first: '4', second: '6' },
      answer: {
        type: 'multipleChoice',
        choices: [
          { id: 'a', content: '4' },
          { id: 'b', content: '6' },
          { id: 'c', content: '7' },
          { id: 'd', content: '9' },
        ],
        correctChoiceIds: ['a', 'b'],
      },
    },
  ],
};
const prompt = 'Select all even numbers.';
function payload() {
  return {
    sortOrder: 0,
    prompt,
    options: { ...options, variants: undefined },
    variants: structuredClone(options.variants),
  };
}

it('resolves choice placeholders and grades each variant against its own exact answer set', () => {
  expect(validateQuizVariants(prompt, options)).toBeNull();
  const one = { id: 'q', ...resolveQuizVariant(prompt, options, 0) };
  const two = { id: 'q', ...resolveQuizVariant(prompt, options, 1) };
  expect(one.options).toEqual({ type: 'multipleChoice', choices: ['2', '3', 'Neither'] });
  expect(two.correctIndices).toEqual([0, 1]);
  expect((two.options as { choices: string[] }).choices).toEqual(['4', '6', '7', '9']);
  expect(gradeAnswer(one, { questionId: 'q', selectedIndices: [0] })).toBe(true);
  expect(gradeAnswer(one, { questionId: 'q', selectedIndices: [0, 1] })).toBe(false);
  expect(gradeAnswer(two, { questionId: 'q', selectedIndices: [1, 0] })).toBe(true);
  expect(gradeAnswer(two, { questionId: 'q', selectedIndices: [0] })).toBe(false);
  expect(gradeAnswer(two, { questionId: 'q', selectedIndices: [0, 1, 2] })).toBe(false);
});
it('persists separate rows, round-trips stable choice IDs and remaps IDs when duplicating', () => {
  const q = dbQuestionToAuthoring({ ...payload(), id: 'q', correctIndices: [] });
  const saved = authoringQuestionToPayload(q, 0);
  expect(quizVariantOptions(saved)).toEqual(options);
  expect(saved.options).not.toHaveProperty('variants');
  expect(serializeQuestionCreate(saved).variants?.create).toHaveLength(2);
  const copy = duplicateQuestion(q);
  if (copy.type !== 'multipleChoice' || q.type !== 'multipleChoice') throw new Error('Wrong type');
  expect(copy.variants![1].answer.correctChoiceIds).toEqual(
    copy.variants![1].answer.choices!.slice(0, 2).map((c) => c.id)
  );
  expect(copy.variants![0].answer.choices![0].id).not.toBe(q.variants![0].answer.choices![0].id);
  expect(copy.variants![0].id).not.toBe(q.variants![0].id);
  expect(csvToQuestions(questionsToCsv([q])).errors).toEqual([]);
  const reordered = structuredClone(q);
  reordered.variants![0].answer.choices!.reverse();
  const resolved = resolveQuizVariant(prompt, quizVariantOptions(authoringQuestionToPayload(reordered, 0))!, 0);
  expect(resolved.correctIndices).toEqual([2]);
});
it('permits incomplete drafts but rejects invalid answer references and checkpoint variants', () => {
  const q = payload();
  q.variants[0].answer.correctChoiceIds = [];
  expect(validateNodeContent({ quizQuestions: [q] }, 'draft')).toBeNull();
  expect(validateNodeContent({ quizQuestions: [q] })).toMatch(/at least one correct/);
  q.variants[0].answer.correctChoiceIds = ['missing'];
  expect(validateNodeContent({ quizQuestions: [q] }, 'draft')).toMatch(/available choices/);
  for (const mode of ['draft', 'publish'] as const)
    expect(
      validateNodeContent({ checkpoints: [{ sortOrder: 0, timeOffsetSeconds: 0, questions: [payload()] }] }, mode)
    ).toMatch(/only supported in the quiz bank/);
  const missing = payload();
  missing.variants[0].values.first = '';
  expect(validateNodeContent({ quizQuestions: [missing] })).toMatch(/every variable/);
});
it('detects answer changes and rejects malformed rows and duplicate IDs across questions', () => {
  const q = payload();
  const before = questionContentKey(q);
  q.variants[0].answer.correctChoiceIds = ['b'];
  expect(questionContentKey(q)).not.toBe(before);
  expect(validateNodeContent({ quizQuestions: [q, { ...q, sortOrder: 1 }] }, 'draft')).toMatch(/unique across/);
  for (const variants of [null, [null], [{ id: 'v', values: {}, answer: null }]]) {
    expect(validateNodeContent({ quizQuestions: [{ ...q, variants } as never] }, 'draft')).not.toBeNull();
  }
});

it('accepts ordinary quiz questions loaded with an empty relational collection', () => {
  expect(
    validateNodeContent({
      quizQuestions: [{ sortOrder: 0, prompt: 'Pick A', options: ['A', 'B'], correctIndices: [0], variants: [] }],
    })
  ).toBeNull();
});
it('compares database JSON and authoring JSON independent of property ordering', () => {
  const q = payload();
  const shuffled = {
    ...q,
    variants: q.variants.map((row) => ({
      ...row,
      answer: { ...row.answer, choices: row.answer.choices!.map((c) => ({ content: c.content, id: c.id })) },
    })),
  };
  expect(questionContentKey(shuffled)).toBe(questionContentKey(q));
});

it('validates every independent choice list and only accepts keys from its own variant', () => {
  for (const choices of [
    undefined,
    [],
    [{ id: 'a', content: 'Only one' }],
    Array.from({ length: 9 }, (_, i) => ({ id: String(i), content: 'Choice' })),
    [
      { id: 'a', content: '' },
      { id: 'b', content: 'B' },
    ],
  ]) {
    const q = payload();
    q.variants[0].answer.choices = choices;
    expect(validateNodeContent({ quizQuestions: [q] })).not.toBeNull();
  }
  const q = payload();
  q.variants[0].answer.correctChoiceIds = ['d'];
  expect(validateNodeContent({ quizQuestions: [q] })).toMatch(/available choices/);
});
it('converts legacy shared choices on read and write without retaining an editable shared choice list', () => {
  const legacy = {
    type: 'variantMultipleChoice' as const,
    version: 1 as const,
    choices: [
      { id: 'a', content: '{{value}}' },
      { id: 'b', content: 'Other' },
    ],
    variants: [
      { id: 'v', values: { value: 'Sodium' }, answer: { type: 'multipleChoice' as const, correctChoiceIds: ['a'] } },
    ],
  };
  const q = { sortOrder: 0, prompt: 'Choose.', options: legacy };
  const editor = dbQuestionToAuthoring({ ...q, id: 'q', correctIndices: [] });
  const saved = serializeQuestionCreate(q);
  expect(saved.options).toEqual({ type: 'variantMultipleChoice', version: 2 });
  expect(saved.variants!.create[0].answer).toMatchObject({
    choices: [
      { id: 'a', content: 'Sodium' },
      { id: 'b', content: 'Other' },
    ],
  });
  expect(questionContentKey(q)).toBe(questionContentKey(authoringQuestionToPayload(editor, 0)));
});
