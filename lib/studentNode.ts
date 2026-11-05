import type { NodeStatus } from '@/app/utils/progressStatus';
import { prisma } from '@/lib/prisma';
import { courseProgressPercent, getStudentCourse } from '@/lib/studentCourses';
import { getStudentLessonRoadmap } from '@/lib/studentLessonRoadmap';

export type NodeScreen = 'LOCKED' | 'COMPLETE' | 'INCOMPLETE' | 'INTRO' | 'QUIZ' | 'REFRESH' | 'RETRY' | 'VIDEO_RESULT';

export interface NodeHistory {
  isFoundational: boolean;
  failedQuizzes: number;
  // The video lesson was finished after the most recent failed quiz (or at all, before any fail).
  watchedVideoSinceFail: boolean;
}

/**
 * Which screen a student sees for a node. Completed and incomplete come from the node's status,
 * which counts the allowed quiz tries.
 * Foundational: quiz (knowledge check) → pass: complete · 1st fail: refresh → video → video result
 * → quiz → 2nd fail: "keep moving forward" → video → video result → quiz → 3rd fail: incomplete.
 * Regular: intro → video → video result → quiz → pass: complete · 1st fail: "keep moving forward"
 * → quiz again → 2nd fail: incomplete.
 */
export function nodeScreen(
  status: NodeStatus,
  { isFoundational, failedQuizzes, watchedVideoSinceFail }: NodeHistory
): NodeScreen {
  if (status === 'LOCKED') return 'LOCKED';
  if (status === 'COMPLETED') return 'COMPLETE';
  if (status === 'INCOMPLETE') return 'INCOMPLETE';
  if (!isFoundational) {
    if (failedQuizzes > 0) return 'RETRY';
    return watchedVideoSinceFail ? 'VIDEO_RESULT' : 'INTRO';
  }
  if (failedQuizzes === 0) return 'QUIZ';
  if (watchedVideoSinceFail) return 'VIDEO_RESULT';
  return failedQuizzes === 1 ? 'REFRESH' : 'RETRY';
}

// The video lesson opens from the intro or after a failed quiz, and stays open to rewatch.
export const canWatchVideo = (screen: NodeScreen) =>
  screen === 'INTRO' || screen === 'REFRESH' || screen === 'RETRY' || screen === 'VIDEO_RESULT';

/**
 * The quiz page opens after the video lesson (without video questions, watching is enough).
 * A regular node's retry goes straight back to the quiz.
 */
export const canOpenQuiz = (screen: NodeScreen, hasVideoQuestions: boolean, isFoundational: boolean) =>
  screen === 'VIDEO_RESULT' || (screen === 'RETRY' && !isFoundational) || (canWatchVideo(screen) && !hasVideoQuestions);

type ScoredAttempt = { completedAt: Date | null; responses: { isCorrect: boolean | null }[] };

const scoreOf = (attempt: ScoredAttempt | undefined) =>
  attempt && {
    correct: attempt.responses.filter((response) => response.isCorrect).length,
    total: attempt.responses.length,
  };

/**
 * Everything the node pages need for one student, or null when the student can't see the node
 * (not enrolled, draft or hidden lesson, or a node that isn't in this lesson).
 */
export async function getStudentNode(
  studentId: string,
  courseId: string,
  courseLessonId: string,
  lessonNodeId: string
) {
  const roadmap = await getStudentLessonRoadmap(studentId, courseId, courseLessonId);
  const node = roadmap?.nodes.find((roadmapNode) => roadmapNode.id === lessonNodeId);
  if (!roadmap || !node) return null;

  const [details, attempts, course] = await Promise.all([
    // The roadmap above already found this node, so it exists.
    prisma.lessonNode.findUniqueOrThrow({
      where: { id: lessonNodeId },
      select: {
        passingPercent: true,
        node: {
          select: {
            learningObjectives: true,
            videoUrl: true,
            muxPlaybackId: true,
            checkpoints: {
              orderBy: { sortOrder: 'asc' },
              select: {
                timeOffsetSeconds: true,
                questions: { where: { kind: 'QUESTION' }, select: { id: true } },
              },
            },
          },
        },
      },
    }),
    prisma.nodeAttempt.findMany({
      where: {
        userId: studentId,
        courseLessonId,
        lessonNodeId,
        kind: { in: ['QUIZ', 'CHECKPOINT'] },
        completedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      select: { kind: true, isPassing: true, completedAt: true, responses: { select: { isCorrect: true } } },
    }),
    getStudentCourse(studentId, courseId),
  ]);

  const quizzes = attempts.filter((attempt) => attempt.kind === 'QUIZ');
  const failedQuizzes = quizzes.filter((attempt) => attempt.isPassing === false);
  const lastFailAt = failedQuizzes[0]?.completedAt;
  const videoSinceFail = attempts.find(
    (attempt) => attempt.kind === 'CHECKPOINT' && (!lastFailAt || attempt.completedAt! > lastFailAt)
  );
  const videoScore = scoreOf(videoSinceFail);

  return {
    courseTitle: roadmap.courseTitle,
    lessonTitle: roadmap.lessonTitle,
    node: { ...node, learningObjectives: details.node.learningObjectives },
    screen: nodeScreen(node.status, {
      isFoundational: node.isFoundational,
      failedQuizzes: failedQuizzes.length,
      watchedVideoSinceFail: Boolean(videoSinceFail),
    }),
    lastQuiz: scoreOf(quizzes[0]),
    // Video questions passed by the same pass mark as the node's quiz.
    lastVideo: videoScore && {
      ...videoScore,
      passed: videoScore.total === 0 || (100 * videoScore.correct) / videoScore.total >= details.passingPercent,
    },
    video: { url: details.node.videoUrl, muxPlaybackId: details.node.muxPlaybackId },
    // When each video question appears, in seconds; null means after the video ends.
    questionTimes: Object.fromEntries(
      details.node.checkpoints.flatMap((checkpoint) =>
        checkpoint.questions.map((question) => [question.id, checkpoint.timeOffsetSeconds])
      )
    ) as Record<string, number | null>,
    hasVideoQuestions: details.node.checkpoints.some((checkpoint) => checkpoint.questions.length > 0),
    coursePercent: courseProgressPercent(course?.lessons ?? []),
  };
}
