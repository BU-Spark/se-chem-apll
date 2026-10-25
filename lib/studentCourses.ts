import type { LessonStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isLessonHidden } from '@/app/utils/lessonSubmissionPolicy';
import { countFinishedNodes, toOutcomeNode, type FinishedQuiz } from '@/lib/nodeOutcomes';

export const asStudent = (studentId: string) => ({ studentId, role: 'STUDENT' as const });

export interface StudentLesson {
  id: string;
  number: number;
  title: string;
  status: LessonStatus;
  // Nodes in the lesson, and how many of them the student finished (completed or incomplete).
  nodeCount: number;
  finishedNodeCount: number;
}

// The course lessons a student can see (no drafts), in order, with the student's progress:
// their stored status, the lesson's visible nodes, and their finished quizzes.
const visibleLessonsQuery = (studentId: string) => ({
  where: { lesson: { isDraft: false } },
  orderBy: { sortOrder: 'asc' as const },
  select: {
    id: true,
    dueDate: true,
    hideAfterDue: true,
    lesson: {
      select: {
        title: true,
        lessonNodes: { where: { node: { isDraft: false } }, select: { id: true, isRequired: true } },
      },
    },
    progress: {
      where: { studentId },
      select: {
        status: true,
        attempts: {
          where: { kind: 'QUIZ' as const, completedAt: { not: null } },
          select: { lessonNodeId: true, isPassing: true },
        },
      },
    },
  },
});

// A course's basic info plus its visible lessons for the student.
const courseWithLessonsQuery = (studentId: string) => ({
  select: { id: true, title: true, description: true, courseLessons: visibleLessonsQuery(studentId) },
});

type CourseLessonRow = {
  id: string;
  dueDate: Date | null;
  hideAfterDue: boolean;
  lesson: { title: string; lessonNodes: { id: string; isRequired: boolean }[] };
  progress: { status: LessonStatus; attempts: FinishedQuiz[] }[];
};

/**
 * The student's status and finished nodes for one lesson. Lessons aren't handed in from the node
 * pages, so finishing every node also counts as completed; a handed-in lesson counts every node.
 */
function lessonProgress({ lesson, progress }: CourseLessonRow) {
  const nodeCount = lesson.lessonNodes.length;
  const stored = progress[0];
  const finished = stored ? countFinishedNodes(lesson.lessonNodes.map(toOutcomeNode), stored.attempts) : 0;
  const status: LessonStatus =
    nodeCount > 0 && finished === nodeCount ? 'COMPLETED' : (stored?.status ?? 'NOT_STARTED');
  return { status, nodeCount, finishedNodeCount: status === 'COMPLETED' ? nodeCount : finished };
}

// Drops lessons hidden after their due date and numbers the rest with the student's progress.
function toStudentLessons(courseLessons: CourseLessonRow[], now: Date): StudentLesson[] {
  return courseLessons
    .filter((courseLesson) => !isLessonHidden(courseLesson, now))
    .map((courseLesson, index) => ({
      id: courseLesson.id,
      number: index + 1,
      title: courseLesson.lesson.title,
      ...lessonProgress(courseLesson),
    }));
}

// Finished nodes out of all nodes in the course's lessons, as a whole percentage (0 without nodes).
export function courseProgressPercent(lessons: StudentLesson[]) {
  const total = lessons.reduce((sum, lesson) => sum + lesson.nodeCount, 0);
  const finished = lessons.reduce((sum, lesson) => sum + lesson.finishedNodeCount, 0);
  return total === 0 ? 0 : Math.round((finished / total) * 100);
}

// Courses the student is enrolled in as a student, oldest enrollment first, with their progress.
export async function getEnrolledCourses(studentId: string, now = new Date()) {
  const enrollments = await prisma.enrollment.findMany({
    where: asStudent(studentId),
    select: {
      course: courseWithLessonsQuery(studentId),
    },
    orderBy: { createdAt: 'asc' },
  });
  return enrollments.map(({ course: { courseLessons, ...course } }) => ({
    ...course,
    progressPercent: courseProgressPercent(toStudentLessons(courseLessons, now)),
  }));
}

// Instructor contacts across the student's courses, listing each instructor once.
export async function getStudentInstructors(studentId: string) {
  const contacts = await prisma.courseContact.findMany({
    where: { type: 'INSTRUCTOR', course: { enrollments: { some: asStudent(studentId) } } },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  const seenEmails = new Set<string>();
  return contacts.filter((contact) => !seenEmails.has(contact.email) && seenEmails.add(contact.email));
}

/**
 * A course the student is enrolled in, with its visible lessons in the professor's order and
 * the student's status for each. Returns null when the student isn't enrolled as a student.
 */
export async function getStudentCourse(studentId: string, courseId: string, now = new Date()) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { ...asStudent(studentId), courseId },
    select: {
      course: courseWithLessonsQuery(studentId),
    },
  });
  if (!enrollment) return null;

  const { courseLessons, ...course } = enrollment.course;
  return { ...course, lessons: toStudentLessons(courseLessons, now) };
}

// The lesson to continue: the first one not completed, or the last one if all are done.
export function findCurrentLesson(lessons: StudentLesson[]) {
  return lessons.find((lesson) => lesson.status !== 'COMPLETED') ?? lessons.at(-1) ?? null;
}
