import { reconcileSavedCheckpoints } from '../reconcileSavedCheckpoints';
import { makeCheckpoint, makeQuestion } from '../types';

const first = {
  ...makeCheckpoint(30, 'client-a'),
  questions: [makeQuestion('client-q1'), makeQuestion('client-q2')],
};
const second = { ...makeCheckpoint(60, 'client-b'), questions: [makeQuestion('client-q3')] };
const submitted = [first, second];
// Response arrays need not be returned in authored order.
const saved = [
  { id: 'db-b', sortOrder: 1, questions: [{ id: 'db-q3', sortOrder: 0 }] },
  {
    id: 'db-a',
    sortOrder: 0,
    questions: [
      { id: 'db-q2', sortOrder: 1 },
      { id: 'db-q1', sortOrder: 0 },
    ],
  },
];

describe('reconcile saved checkpoint identities', () => {
  it('preserves current ordering and edits while resolving identities from the submitted order', () => {
    const edited = {
      ...first,
      timeOffsetSeconds: 90,
      questions: [{ ...first.questions[1], prompt: 'Edited during saving' }, first.questions[0]],
    };
    const result = reconcileSavedCheckpoints([second, edited], submitted, saved);
    expect(result.map((c) => [c.id, c.persistedId])).toEqual([
      ['client-b', 'db-b'],
      ['client-a', 'db-a'],
    ]);
    expect(result[1].timeOffsetSeconds).toBe(90);
    expect(result[1].questions.map((q) => [q.id, q.persistedId, q.prompt])).toEqual([
      ['client-q2', 'db-q2', 'Edited during saving'],
      ['client-q1', 'db-q1', ''],
    ]);
    expect(submitted[0].persistedId).toBeUndefined();
  });

  it('keeps deletions and leaves newly added checkpoints and questions without database IDs', () => {
    const added = makeCheckpoint(null, 'new-checkpoint');
    const addedQuestion = makeQuestion('new-question');
    const result = reconcileSavedCheckpoints(
      [added, { ...first, questions: [addedQuestion, first.questions[1]] }],
      submitted,
      saved
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(added);
    expect(result[1].questions).toEqual([addedQuestion, { ...first.questions[1], persistedId: 'db-q2' }]);
  });

  it('does not attach old identities to a CSV replacement that reuses checkpoint keys', () => {
    const replacement = { ...first, id: 'imported-checkpoint', questions: [makeQuestion('imported-question')] };
    expect(reconcileSavedCheckpoints([replacement], submitted, saved)).toEqual([replacement]);
  });

  it('keeps known identities when response records are missing', () => {
    const known = { ...first, persistedId: 'db-a', questions: [{ ...first.questions[0], persistedId: 'db-q1' }] };
    expect(reconcileSavedCheckpoints([known], submitted, [])).toEqual([known]);
    expect(reconcileSavedCheckpoints([known], submitted, [{ id: 'db-a', sortOrder: 0, questions: [] }])).toEqual([
      known,
    ]);
  });
});
