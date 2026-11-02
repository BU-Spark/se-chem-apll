import type { NodeStatus } from '@/app/utils/progressStatus';
import { prisma } from '@/lib/prisma';
import { isLessonHidden } from '@/app/utils/lessonSubmissionPolicy';
import { asStudent } from '@/lib/studentCourses';
import { quizOutcomes, toOutcomeNode } from '@/lib/nodeOutcomes';

export interface RoadmapNode {
  id: string;
  title: string;
  isFoundational: boolean;
  status: NodeStatus;
}

export interface RoadmapEdge {
  sourceId: string;
  targetId: string;
}

/**
 * Node states: complete once the student passed its quiz, incomplete after every allowed quiz try
 * failed, locked while any node with an arrow into it is neither, otherwise in progress once a
 * quiz or video-question try was started, or not started.
 */
export function computeNodeStatuses(
  nodeIds: string[],
  edges: RoadmapEdge[],
  completedIds: Set<string>,
  incompleteIds: Set<string>,
  startedIds: Set<string> = new Set()
): Record<string, NodeStatus> {
  const finished = (id: string) => completedIds.has(id) || incompleteIds.has(id);
  const statuses: Record<string, NodeStatus> = {};
  for (const id of nodeIds) {
    const prerequisitesDone = edges.filter((edge) => edge.targetId === id).every((edge) => finished(edge.sourceId));
    if (completedIds.has(id)) statuses[id] = 'COMPLETED';
    else if (incompleteIds.has(id)) statuses[id] = 'INCOMPLETE';
    else if (!prerequisitesDone) statuses[id] = 'LOCKED';
    else statuses[id] = startedIds.has(id) ? 'IN_PROGRESS' : 'NOT_STARTED';
  }
  return statuses;
}

/**
 * One lesson of a course as a node map for the student, or null when the student isn't
 * enrolled, or the lesson is a draft, hidden after its due date, or not in this course.
 */
export async function getStudentLessonRoadmap(
  studentId: string,
  courseId: string,
  courseLessonId: string,
  now = new Date()
) {
  const courseLesson = await prisma.courseLesson.findFirst({
    where: {
      id: courseLessonId,
      courseId,
      lesson: { isDraft: false },
      course: { enrollments: { some: asStudent(studentId) } },
    },
    select: {
      dueDate: true,
      hideAfterDue: true,
      course: { select: { title: true } },
      lesson: {
        select: {
          title: true,
          lessonNodes: {
            where: { node: { isDraft: false } },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, isRequired: true, node: { select: { title: true } } },
          },
          lessonNodeEdges: { select: { sourceId: true, targetId: true } },
        },
      },
    },
  });
  if (!courseLesson || isLessonHidden(courseLesson, now)) return null;

  // Every quiz and video-question try, finished or not.
  const attempts = await prisma.nodeAttempt.findMany({
    where: { userId: studentId, courseLessonId, kind: { in: ['QUIZ', 'CHECKPOINT'] } },
    select: { lessonNodeId: true, kind: true, isPassing: true, completedAt: true },
  });
  const quizzes = attempts.filter((attempt) => attempt.kind === 'QUIZ' && attempt.completedAt);
  const startedIds = new Set(attempts.flatMap((attempt) => attempt.lessonNodeId ?? []));

  const { lessonNodes, lessonNodeEdges } = courseLesson.lesson;
  const nodeIds = new Set(lessonNodes.map((lessonNode) => lessonNode.id));
  // Skip arrows to or from draft nodes, which students don't see.
  const edges = lessonNodeEdges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));
  const { completedIds, incompleteIds } = quizOutcomes(lessonNodes.map(toOutcomeNode), quizzes);
  const statuses = computeNodeStatuses([...nodeIds], edges, completedIds, incompleteIds, startedIds);

  const nodes: RoadmapNode[] = lessonNodes.map((lessonNode) => ({
    ...toOutcomeNode(lessonNode),
    title: lessonNode.node.title,
    status: statuses[lessonNode.id],
  }));

  return { courseTitle: courseLesson.course.title, lessonTitle: courseLesson.lesson.title, nodes, edges };
}
