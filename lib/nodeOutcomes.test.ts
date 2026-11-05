import { countFinishedNodes, quizOutcomes } from './nodeOutcomes';

const pass = (lessonNodeId: string) => ({ lessonNodeId, isPassing: true });
const fail = (lessonNodeId: string) => ({ lessonNodeId, isPassing: false });
const foundational = (id: string) => ({ id, isFoundational: true });
const regular = (id: string) => ({ id, isFoundational: false });

describe('quizOutcomes', () => {
  it('completes a node on any pass; foundational nodes are incomplete after three fails', () => {
    const nodes = ['a', 'b', 'c'].map(foundational);
    const { completedIds, incompleteIds } = quizOutcomes(nodes, [
      fail('a'),
      pass('a'),
      fail('b'),
      fail('b'),
      fail('c'),
      fail('c'),
      fail('c'),
    ]);
    expect([...completedIds]).toEqual(['a']);
    expect([...incompleteIds]).toEqual(['c']);
  });

  it('makes a regular node incomplete after two fails', () => {
    expect([...quizOutcomes([regular('r')], [fail('r')]).incompleteIds]).toEqual([]);
    expect([...quizOutcomes([regular('r')], [fail('r'), fail('r')]).incompleteIds]).toEqual(['r']);
  });
});

describe('countFinishedNodes', () => {
  it('counts completed and incomplete nodes, not open ones', () => {
    const nodes = [foundational('a'), foundational('b'), regular('c')];
    expect(countFinishedNodes(nodes, [pass('a'), fail('b'), fail('c'), fail('c')])).toBe(2);
  });

  it('is 0 for a lesson without nodes', () => {
    expect(countFinishedNodes([], [])).toBe(0);
  });
});
