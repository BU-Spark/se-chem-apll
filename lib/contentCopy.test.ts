/** @jest-environment node */
import { buildContentCopy } from './contentCopy';
import { copyLessonFixture, copyNodeFixture } from '@/test/fixtures/contentCopy';

it('makes independent content and remaps roadmap instances while deduplicating reused nodes', () => {
  const second = { ...copyLessonFixture, id: 'second-lesson' };
  const copy = buildContentCopy([copyLessonFixture, second], [copyNodeFixture], 'new-owner');
  expect(copy.nodeData).toHaveLength(1);
  expect(copy.lessonData).toHaveLength(2);
  expect(copy.nodeIds.get('node-old')).not.toBe('node-old');
  expect(copy.nodeData[0]).toMatchObject({
    createdByClerkId: 'new-owner',
    videoUrl: copyNodeFixture.videoUrl,
    muxPlaybackId: 'playback',
    quizQuestions: {
      create: [{ prompt: 'Quiz?', variants: { create: [{ values: { x: 1 }, answer: { value: 2 } }] } }],
    },
    checkpoints: {
      create: [{ timeOffsetSeconds: 25, questions: { create: [{ prompt: 'Checkpoint?', correctIndices: [1] }] } }],
    },
  });
  const first = copy.lessonData[0];
  const instances = first.lessonNodes!.create as { id: string; nodeId: string }[];
  expect(instances[0].id).not.toBe('instance-a');
  expect(instances[0].nodeId).toBe(copy.nodeIds.get('node-old'));
  expect(copy.edges[0]).toEqual({ lessonId: first.id, sourceId: instances[0].id, targetId: instances[1].id });
  expect(copy.edges[1].sourceId).not.toBe(copy.edges[0].sourceId);
  expect(first).toMatchObject({ createdByClerkId: 'new-owner', surveys: { create: [{ question: 'How was it?' }] } });
  expect(first.slug).not.toBe(copyLessonFixture.slug);
  const serialized = JSON.stringify(copy);
  for (const excluded of [
    'checkpoint-question-old',
    'quiz-old',
    'variant-old',
    'student',
    'progress',
    'responses',
    'attempts',
    'badgeRequirements',
  ])
    expect(serialized).not.toContain(excluded);
  expect(copyLessonFixture.lessonNodes[0].id).toBe('instance-a');
});

it('rejects corrupt roadmap references before any writes can be constructed', () => {
  expect(() =>
    buildContentCopy(
      [{ ...copyLessonFixture, lessonNodeEdges: [{ ...copyLessonFixture.lessonNodeEdges[0], targetId: 'missing' }] }],
      [],
      'owner'
    )
  ).toThrow('invalid edge');
});
