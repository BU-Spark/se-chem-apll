import {
  quizVariantOptions,
  questionVariables,
  renderQuestionVariant,
  resolveQuestionVariant,
  validateVariantOptions,
  type VariantOptions,
} from './questionVariants';
import { questionContentKey, validateNodeContent } from './nodeContent';
import { authoringQuestionToPayload, dbQuestionToAuthoring } from '@/app/components/QuestionBank/adapters';
import { duplicateQuestion, type ShortAnswerQuestion } from '@/app/components/QuestionBank/types';
import { gradeAnswer } from '@/lib/submissions/grading';

const prompt = 'How many moles of $\\ce{ {{compound}} }$ are in {{mass}} g?';
const options: VariantOptions = {
  type: 'variantShortAnswer',
  version: 1,
  variants: [
    {
      id: 'salt',
      values: { compound: 'NaCl', mass: '58.44' },
      answer: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: 1 },
    },
    {
      id: 'water',
      values: { compound: 'H2O', mass: '36.03' },
      answer: { type: 'shortAnswer', answerMode: 'range', minimumAnswer: 1.99, maximumAnswer: 2.01 },
    },
  ],
};

it('finds unique named placeholders and substitutes literal values without evaluating or recursively expanding them', () => {
  expect(questionVariables('{{Compound}} {{ mass }} {{Compound}} $x^{2}$')).toEqual(['Compound', 'mass']);
  expect(renderQuestionVariant('{{name}} {{mass}} {{missing}}', { name: '$& {{mass}}', mass: '1' })).toBe(
    '$& {{mass}} 1 {{missing}}'
  );
  expect(renderQuestionVariant('{{constructor}}', {})).toBe('{{constructor}}');
});

it('keeps compound, mass, and grading key together for exact and range variants', () => {
  const salt = { id: 'q', correctIndices: [], ...resolveQuestionVariant(prompt, options, 0) };
  const water = { id: 'q', correctIndices: [], ...resolveQuestionVariant(prompt, options, 1) };
  expect(salt.prompt).toBe('How many moles of $\\ce{ NaCl }$ are in 58.44 g?');
  expect(water.prompt).toContain('36.03');
  expect(gradeAnswer(salt, { questionId: 'q', rawAnswer: '1' })).toBe(true);
  expect(gradeAnswer(salt, { questionId: 'q', rawAnswer: '2' })).toBe(false);
  expect(gradeAnswer(water, { questionId: 'q', rawAnswer: '2' })).toBe(true);
  expect(gradeAnswer(water, { questionId: 'q', rawAnswer: '2.02' })).toBe(false);
});

it('round-trips variants and incomplete rows through the authoring and database shapes', () => {
  const q = dbQuestionToAuthoring({ id: 'q', prompt, options, correctIndices: [] }) as ShortAnswerQuestion;
  expect(quizVariantOptions(authoringQuestionToPayload(q, 0))).toEqual(options);
  q.variants!.push({ id: 'empty', values: {}, answer: { mode: 'range', minimum: '', maximum: '' } });
  const payload = authoringQuestionToPayload(q, 0);
  expect(validateNodeContent({ quizQuestions: [payload] }, 'draft')).toBeNull();
  expect(validateNodeContent({ quizQuestions: [payload] })).toContain('Variant 3');
  expect(dbQuestionToAuthoring({ ...payload, id: q.id, correctIndices: [] })).toEqual(q);
  const copy = duplicateQuestion(q) as ShortAnswerQuestion;
  expect(copy.variants![0].id).not.toBe(q.variants![0].id);
  copy.variants![0].values.mass = '10';
  expect(q.variants![0].values.mass).toBe('58.44');
});

it.each([
  { ...options, version: 2 },
  { ...options, variants: null },
  { ...options, variants: [null] },
  { ...options, variants: [options.variants[0], options.variants[0]] },
  { ...options, variants: [{ ...options.variants[0], values: { compound: 42 } }] },
  {
    ...options,
    variants: [
      { ...options.variants[0], answer: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: Infinity } },
    ],
  },
])('rejects malformed variant data even in drafts: %j', (invalid) => {
  expect(validateVariantOptions(prompt, invalid, true)).not.toBeNull();
});

it('requires variables, complete rows and ordered answer ranges before publishing', () => {
  expect(validateVariantOptions('No placeholders', options)).toMatch(/variable/);
  expect(validateVariantOptions(prompt, { ...options, variants: [] })).toMatch(/at least one/);
  expect(
    validateVariantOptions(prompt, { ...options, variants: [{ ...options.variants[0], values: { compound: 'NaCl' } }] })
  ).toMatch(/every variable/);
  expect(
    validateVariantOptions(prompt, {
      ...options,
      variants: [
        {
          ...options.variants[0],
          answer: { type: 'shortAnswer', answerMode: 'range', minimumAnswer: 2, maximumAnswer: 1 },
        },
      ],
    })
  ).toMatch(/minimum/);
  expect(validateNodeContent({ quizQuestions: [{ prompt, options, sortOrder: 0 }] })).toBeNull();
  expect(
    validateNodeContent({
      checkpoints: [
        { checkpointKey: 'cue', sortOrder: 0, timeOffsetSeconds: 0, questions: [{ prompt, options, sortOrder: 0 }] },
      ],
    })
  ).toMatch(/only supported in the quiz bank/);
});

it('detects changed variants while ignoring JSON object property order', () => {
  const q = { prompt, options, sortOrder: 0 };
  const reordered = {
    ...options,
    variants: options.variants.map((row) => ({
      ...row,
      values: { mass: row.values.mass, compound: row.values.compound },
    })),
  };
  expect(questionContentKey(q)).toBe(questionContentKey({ ...q, options: reordered }));
  reordered.variants[0].values.mass = '100';
  expect(questionContentKey(q)).not.toBe(questionContentKey({ ...q, options: reordered }));
});
