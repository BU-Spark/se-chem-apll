import { validateNodeContent } from './nodeContent';

const checkpoint = {
  checkpointKey: 'intro',
  sortOrder: 0,
  timeOffsetSeconds: null,
  questions: [{ sortOrder: 0, kind: 'note', prompt: 'Observe.', options: { type: 'note' } }],
};
describe('node content readiness', () => {
  it('allows multiple unplaced checkpoints only in draft mode', () => {
    const payload = { checkpoints: [checkpoint, { ...checkpoint, checkpointKey: 'next', sortOrder: 1 }] };
    expect(validateNodeContent(payload, 'draft')).toBeNull();
    expect(validateNodeContent(payload)).toMatch(/timestamp/);
  });
  it('accepts stored Prisma NOTE kinds during publication', () => {
    expect(
      validateNodeContent({
        checkpoints: [
          { ...checkpoint, timeOffsetSeconds: 0, questions: [{ ...checkpoint.questions[0], kind: 'NOTE' }] },
        ],
      })
    ).toBeNull();
  });
  it('permits incomplete draft questions but rejects invalid structures', () => {
    const question = {
      sortOrder: 0,
      prompt: '',
      options: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: null },
      correctIndices: [],
    };
    expect(validateNodeContent({ quizQuestions: [question] }, 'draft')).toBeNull();
    expect(validateNodeContent({ quizQuestions: [question] })).not.toBeNull();
    expect(validateNodeContent({ checkpoints: [null] } as never, 'draft')).toMatch(/object/);
    expect(validateNodeContent({ checkpoints: [{ ...checkpoint, questions: null }] } as never, 'draft')).toMatch(
      /array/
    );
  });
  it('rejects duplicate keys, duplicate nonnull timestamps and invalid order even in drafts', () => {
    expect(validateNodeContent({ checkpoints: [checkpoint, { ...checkpoint, sortOrder: 1 }] }, 'draft')).toMatch(
      /keys/
    );
    expect(
      validateNodeContent({ checkpoints: [checkpoint, { ...checkpoint, checkpointKey: 'next' }] }, 'draft')
    ).toMatch(/sortOrder/);
    expect(
      validateNodeContent(
        {
          checkpoints: [checkpoint, { ...checkpoint, checkpointKey: 'next', sortOrder: 1 }].map((c) => ({
            ...c,
            timeOffsetSeconds: 1,
          })),
        },
        'draft'
      )
    ).toMatch(/unique/);
    expect(validateNodeContent({ checkpoints: [{ ...checkpoint, timeOffsetSeconds: -1 }] }, 'draft')).toMatch(
      /timestamp/
    );
  });
});
