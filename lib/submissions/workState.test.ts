import { evaluateWork } from './workState';
import { workNode, workAttempt } from '@/test/mocks/work';

it('reopens only stale work and blocks new dependent work until prerequisites are current', () => {
  const a = workNode('a');
  const b = workNode('b');
  const old = workAttempt(a);
  a.passingPercent = 90;
  const state = evaluateWork([a, b], [old, workAttempt(b)], true, [{ sourceId: 'a', targetId: 'b' }]);
  expect(state.states[0]).toMatchObject({ needsUpdatedWork: true, terminal: false, canStartQuiz: true });
  expect(state.states[1]).toMatchObject({ terminal: true, prerequisitesReady: false, canImprove: false });
  expect(state.ready).toBe(false);
});

it('allows one improvement after submission and exposes its existing unfinished attempt for resume', () => {
  const node = workNode('n');
  const first = workAttempt(node);
  expect(evaluateWork([node], [first], false).states[0].canImprove).toBe(false);
  expect(evaluateWork([node], [first], true).states[0].canImprove).toBe(true);
  const improvement = workAttempt(node, { id: 'improvement', purpose: 'IMPROVEMENT', completedAt: null });
  expect(evaluateWork([node], [first, improvement], true).states[0]).toMatchObject({
    canImprove: false,
    improvementAttemptId: 'improvement',
    terminal: true,
  });
});
