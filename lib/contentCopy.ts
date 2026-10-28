import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const copyLessonInclude = {
  lessonNodes: {
    orderBy: { sortOrder: 'asc' },
    include: {
      node: {
        include: {
          checkpoints: { include: { questions: true } },
          quizQuestions: { include: { variants: true } },
        },
      },
    },
  },
  lessonNodeEdges: true,
  surveys: true,
} satisfies Prisma.LessonInclude;

export type CopyLesson = Prisma.LessonGetPayload<{ include: typeof copyLessonInclude }>;
export type CopyNode = CopyLesson['lessonNodes'][number]['node'];
const json = (value: Prisma.JsonValue) => (value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue));

/** Builds fresh authoring records only. IDs are allocated before the array transaction. */
export function buildContentCopy(lessons: CopyLesson[], nodes: CopyNode[], owner: string) {
  const nodeIds = new Map<string, string>();
  const lessonIds = new Map<string, string>();
  const uniqueNodes = new Map(nodes.map((node) => [node.id, node]));
  for (const lesson of lessons) for (const entry of lesson.lessonNodes) uniqueNodes.set(entry.nodeId, entry.node);
  const nodeData: Prisma.NodeCreateInput[] = [...uniqueNodes.values()].map((node) => {
    const id = randomUUID();
    nodeIds.set(node.id, id);
    return {
      id,
      createdByClerkId: owner,
      title: node.title,
      summary: node.summary,
      videoUrl: node.videoUrl,
      muxPlaybackId: node.muxPlaybackId,
      thumbnailUrl: node.thumbnailUrl,
      estimatedMinutes: node.estimatedMinutes,
      tags: node.tags,
      learningObjectives: node.learningObjectives,
      isDraft: node.isDraft,
      checkpoints: {
        create: node.checkpoints.map((checkpoint) => ({
          sortOrder: checkpoint.sortOrder,
          timeOffsetSeconds: checkpoint.timeOffsetSeconds,
          checkpointKey: checkpoint.checkpointKey,
          placementHint: checkpoint.placementHint,
          questions: {
            create: checkpoint.questions.map((question) => ({
              sortOrder: question.sortOrder,
              kind: question.kind,
              prompt: question.prompt,
              options: json(question.options),
              correctIndices: question.correctIndices,
            })),
          },
        })),
      },
      quizQuestions: {
        create: node.quizQuestions.map((question) => ({
          sortOrder: question.sortOrder,
          prompt: question.prompt,
          options: json(question.options),
          correctIndices: question.correctIndices,
          variants: {
            create: question.variants.map((variant) => ({
              sortOrder: variant.sortOrder,
              values: json(variant.values),
              answer: json(variant.answer),
            })),
          },
        })),
      },
    };
  });
  const edges: Prisma.LessonNodeEdgeCreateManyInput[] = [];
  const lessonData: Prisma.LessonCreateInput[] = lessons.map((lesson) => {
    const id = randomUUID();
    lessonIds.set(lesson.id, id);
    const instanceIds = new Map(lesson.lessonNodes.map((entry) => [entry.id, randomUUID()]));
    for (const edge of lesson.lessonNodeEdges) {
      const sourceId = instanceIds.get(edge.sourceId),
        targetId = instanceIds.get(edge.targetId);
      if (!sourceId || !targetId) throw new Error('Source roadmap contains an invalid edge.');
      edges.push({ lessonId: id, sourceId, targetId });
    }
    return {
      id,
      createdByClerkId: owner,
      title: lesson.title,
      summary: lesson.summary,
      slug: `${lesson.slug || 'lesson'}-copy-${id}`,
      description: lesson.description,
      thumbnailUrl: lesson.thumbnailUrl,
      estimatedMinutes: lesson.estimatedMinutes,
      isDraft: lesson.isDraft,
      lessonNodes: {
        create: lesson.lessonNodes.map((entry) => ({
          id: instanceIds.get(entry.id),
          nodeId: nodeIds.get(entry.nodeId)!,
          sortOrder: entry.sortOrder,
          passingPercent: entry.passingPercent,
          quizQuestionCount: entry.quizQuestionCount,
          isRequired: entry.isRequired,
        })),
      },
      surveys: { create: lesson.surveys.map((survey) => ({ context: survey.context, question: survey.question })) },
    };
  });
  return { nodeIds, lessonIds, nodeData, lessonData, edges };
}
