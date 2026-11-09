import type { NodeStatus } from '@/app/utils/progressStatus';
import { prisma } from '@/lib/prisma';
import { nodeKey, workNodeInclude } from '@/lib/submissions/content';
import { evaluateWork } from '@/lib/submissions/workState';
import { isLessonHidden, submissionStatus } from '@/app/utils/lessonSubmissionPolicy';
import { asStudent } from '@/lib/studentCourses';
import { toOutcomeNode } from '@/lib/nodeOutcomes';

export interface RoadmapNode {
  id: string;
  title: string;
  isFoundational: boolean;
  status: NodeStatus;
  needsUpdatedWork: boolean;
  canImprove: boolean;
  improvementAttemptId: string | null;
  needsCheckpoint: boolean;
  currentContentKey: string;
  prerequisitesReady: boolean;
  openForWork: boolean;
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
      openDate: true,
      lateDeadline: true,
      latePenaltyType: true,
      latePenaltyPercent: true,
      progress: { where: { studentId }, select: { submissions: { take: 1, select: { id: true } } } },
      dueDate: true,
      hideAfterDue: true,
      course: { select: { title: true } },
      lesson: {
        select: {
          title: true,
          lessonNodes: {
            where: { node: { isDraft: false } },
            orderBy: { sortOrder: 'asc' },
            include: workNodeInclude,
          },
          lessonNodeEdges: { select: { sourceId: true, targetId: true } },
        },
      },
    },
  });
  if (!courseLesson || isLessonHidden(courseLesson, now)) return null;

  // Every quiz, video-question or review attempt, finished or not.
  const attempts = await prisma.nodeAttempt.findMany({
    where: { userId: studentId, courseLessonId, kind: { in: ['QUIZ', 'CHECKPOINT', 'REVIEW'] } },
    select: {
      id: true,
      purpose: true,
      contentKey: true,
      lessonNodeId: true,
      kind: true,
      isPassing: true,
      completedAt: true,
    },
  });

  const { lessonNodes, lessonNodeEdges } = courseLesson.lesson;
  const nodeIds = new Set(lessonNodes.map((lessonNode) => lessonNode.id));
  // Skip arrows to or from draft nodes, which students don't see.
  const edges = lessonNodeEdges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));
  const evaluation = evaluateWork(lessonNodes, attempts, Boolean(courseLesson.progress[0]?.submissions.length), edges);
  const openForWork = ['ON_TIME', 'LATE'].includes(submissionStatus(courseLesson, now));
  const nodes: RoadmapNode[] = lessonNodes.map((lessonNode) => {
    const state = evaluation.states.find((s) => s.id === lessonNode.id)!;
    return {
      ...toOutcomeNode(lessonNode),
      title: lessonNode.node.title,
      status:
        state.outcome ?? (!state.prerequisitesReady ? 'LOCKED' : state.current.length ? 'IN_PROGRESS' : 'NOT_STARTED'),
      needsUpdatedWork: state.needsUpdatedWork,
      canImprove: openForWork && state.canImprove,
      improvementAttemptId: state.improvementAttemptId,
      needsCheckpoint: state.needsCheckpoint,
      currentContentKey: nodeKey(lessonNode),
      prerequisitesReady: state.prerequisitesReady,
      openForWork,
    };
  });

  return { courseTitle: courseLesson.course.title, lessonTitle: courseLesson.lesson.title, nodes, edges };
}
