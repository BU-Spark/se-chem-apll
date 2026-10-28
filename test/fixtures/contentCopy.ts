import type { CopyLesson, CopyNode } from '@/lib/contentCopy';

export const copyNodeFixture = {
  id: 'node-old',
  title: 'Atoms',
  summary: 'Node summary',
  videoUrl: 'https://example.com/video',
  muxPlaybackId: 'playback',
  thumbnailUrl: 'https://example.com/thumb',
  estimatedMinutes: 10,
  tags: ['chemistry'],
  learningObjectives: ['Learn'],
  isDraft: false,
  createdByClerkId: 'other',
  checkpoints: [
    {
      id: 'checkpoint-old',
      sortOrder: 0,
      timeOffsetSeconds: 25,
      checkpointKey: 'cue-1',
      placementHint: null,
      questions: [
        {
          id: 'checkpoint-question-old',
          sortOrder: 0,
          kind: 'QUESTION',
          prompt: 'Checkpoint?',
          options: ['a', 'b'],
          correctIndices: [1],
        },
      ],
    },
  ],
  quizQuestions: [
    {
      id: 'quiz-old',
      sortOrder: 0,
      prompt: 'Quiz?',
      options: { type: 'shortAnswer', answerMode: 'exact', answer: 2 },
      correctIndices: [],
      variants: [{ id: 'variant-old', sortOrder: 0, values: { x: 1 }, answer: { value: 2 } }],
    },
  ],
} as unknown as CopyNode;

export const copyLessonFixture = {
  id: 'lesson-old',
  title: 'Chemistry',
  slug: 'chemistry',
  summary: 'Lesson summary',
  description: 'Description',
  thumbnailUrl: null,
  estimatedMinutes: 20,
  isDraft: false,
  createdByClerkId: 'other',
  lessonNodes: [
    {
      id: 'instance-a',
      nodeId: 'node-old',
      node: copyNodeFixture,
      sortOrder: 0,
      passingPercent: 85,
      quizQuestionCount: 1,
      isRequired: true,
    },
    {
      id: 'instance-b',
      nodeId: 'node-old',
      node: copyNodeFixture,
      sortOrder: 1,
      passingPercent: 75,
      quizQuestionCount: 1,
      isRequired: false,
    },
  ],
  lessonNodeEdges: [{ id: 'edge-old', sourceId: 'instance-a', targetId: 'instance-b' }],
  surveys: [{ id: 'survey-old', context: 'LESSON', question: 'How was it?' }],
  progress: [{ studentId: 'student' }],
} as unknown as CopyLesson;
