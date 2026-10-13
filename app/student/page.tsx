import { auth, currentUser } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import styles from './page.module.css';
import StudentDailyTimeline from '@/app/components/StudentDailyTimeline/StudentDailyTimeline';
import NodePreview from '@/app/components/NodePreview/NodePreview';
import StudentQuizTaskList from '@/app/components/StudentQuizTaskList/StudentQuizTaskList';
import { getFoundationalAccess } from '@/app/utils/foundationalAccess';
import { describeLatePenalty, isLessonHidden, submissionStatus } from '@/app/utils/lessonSubmissionPolicy';

const formatDeadline = (date: Date) => date.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' });

export const dynamic = 'force-dynamic';

export default async function StudentHomePage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();
  if (!clerkUser) redirect('/sign-in');
  const email =
    clerkUser?.emailAddresses?.find((address) => address.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) redirect('/sign-in');

  const normalizedEmail = email.trim().toLowerCase();

  // Find or create the student's User record
  let student = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!student) {
    student = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: clerkUser.fullName ?? clerkUser.firstName ?? undefined,
      },
    });
  } else if (!student.name && (clerkUser.fullName || clerkUser.firstName)) {
    // Backfill name if missing
    student = await prisma.user.update({
      where: { id: student.id },
      data: { name: clerkUser.fullName ?? clerkUser.firstName ?? undefined },
    });
  }

  // Fetch enrolled courses with their lessons, nodes and student progress
  const enrolledCourses = await prisma.enrollment.findMany({
    where: { studentId: student.id, role: 'STUDENT' },
    include: {
      course: {
        include: {
          courseLessons: {
            where: { lesson: { isDraft: false } },
            orderBy: { sortOrder: 'asc' },
            include: {
              progress: {
                where: { studentId: student.id },
                include: {
                  attempts: {
                    where: { kind: 'QUIZ' },
                    orderBy: { createdAt: 'desc' },
                    include: { responses: { select: { quizQuestionId: true, checkpointQuestionId: true } } },
                  },
                },
              },
              lesson: {
                include: {
                  lessonNodes: {
                    where: { node: { isDraft: false } },
                    orderBy: { sortOrder: 'asc' },
                    include: {
                      node: {
                        include: {
                          _count: {
                            select: { quizQuestions: true },
                          },
                          checkpoints: {
                            select: {
                              _count: { select: { questions: { where: { kind: 'QUESTION' } } } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const now = new Date();
  const enrollments = enrolledCourses.map((enrollment) => ({
    ...enrollment,
    course: {
      ...enrollment.course,
      courseLessons: enrollment.course.courseLessons.filter((assignment) => !isLessonHidden(assignment, now)),
    },
  }));

  // Build a lightweight "today" shape for the StudentDailyTimeline component
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const dailyEnrollments = enrollments
    .map(({ course }) => {
      const lessonsToday = course.courseLessons
        .filter((cl) => {
          const open = cl.openDate ? new Date(cl.openDate) : null;
          const due = cl.lateDeadline ?? cl.dueDate;
          const progress = (cl.progress && cl.progress[0]) ?? null;
          const startedAt = progress?.startedAt ? new Date(progress.startedAt) : null;
          const completedAt = progress?.completedAt ? new Date(progress.completedAt) : null;
          const overlaps =
            (open && open <= todayEnd && (!due || due >= todayStart)) ||
            (startedAt && startedAt >= todayStart && startedAt <= todayEnd) ||
            (completedAt && completedAt >= todayStart && completedAt <= todayEnd);
          return overlaps;
        })
        .map((cl) => ({
          ...cl.lesson,
          openDate: cl.openDate,
          dueDate: cl.dueDate,
        }));
      return {
        courseId: course.id,
        title: course.title,
        code: course.code,
        section: course.section,
        lessons: lessonsToday,
      };
    })
    .filter((e) => e.lessons.length > 0);
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>My Courses</h1>

      {/* Today's timeline (if any) */}
      {dailyEnrollments.length > 0 && <StudentDailyTimeline data={dailyEnrollments} />}

      {enrollments.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No courses yet</p>
          <p className={styles.emptyDesc}>
            You are not enrolled in any courses. Contact your instructor to get started.
          </p>
        </div>
      ) : (
        <div className={styles.courseList}>
          {enrollments.map(({ course }) => (
            <div key={course.id} className={styles.courseCard}>
              <div className={styles.courseHeader}>
                <div>
                  <h2 className={styles.courseTitle}>{course.title}</h2>
                  <span className={styles.courseCode}>
                    {course.code}
                    {course.section ? ` · Section ${course.section}` : ''}
                  </span>
                </div>
                <span className={styles.courseBadge}>
                  {course.courseLessons.length} lesson{course.courseLessons.length !== 1 ? 's' : ''}
                </span>
              </div>

              {course.description && <p className={styles.courseDesc}>{course.description}</p>}

              {course.courseLessons.length === 0 ? (
                <p className={styles.noLessons}>No lessons assigned yet.</p>
              ) : (
                <ul className={styles.lessonList}>
                  {course.courseLessons.map((cl) => {
                    const lesson = {
                      ...cl.lesson,
                      openDate: cl.openDate,
                      dueDate: cl.dueDate,
                    };
                    const isUpcoming = lesson.openDate !== null && now < lesson.openDate;
                    const isPastDue = lesson.dueDate !== null && now > lesson.dueDate;
                    const isClosed = submissionStatus(cl, now) === 'CLOSED';
                    const cardClass = isUpcoming ? styles.lessonCardUnavailable : styles.lessonCard;

                    return (
                      <li key={lesson.id} className={cardClass}>
                        <div className={styles.lessonBody}>
                          <div className={styles.lessonTitleRow}>
                            <p className={styles.lessonTitle}>{lesson.title}</p>
                            {isUpcoming && (
                              <span className={`${styles.lessonStatus} ${styles.lessonStatusUpcoming}`}>
                                Opens {formatDeadline(lesson.openDate!)}
                              </span>
                            )}
                            {isClosed && (
                              <span className={`${styles.lessonStatus} ${styles.lessonStatusClosed}`}>
                                Submissions closed
                              </span>
                            )}
                          </div>
                          <p className={styles.lessonMeta}>
                            {lesson.lessonNodes.length} node
                            {lesson.lessonNodes.length !== 1 ? 's' : ''}
                            {lesson.estimatedMinutes ? ` · ~${lesson.estimatedMinutes} min` : ''}
                            {lesson.openDate && !isUpcoming ? ` · Opened ${formatDeadline(lesson.openDate)}` : ''}
                            {lesson.dueDate && !isPastDue ? ` · Due ${formatDeadline(lesson.dueDate)}` : ''}
                            {isPastDue && lesson.dueDate ? (
                              <>
                                {' · '}
                                <span className={styles.wasDue}>Was Due on {formatDeadline(lesson.dueDate)}</span>
                              </>
                            ) : null}
                          </p>
                          {cl.lateDeadline && (
                            <p className={styles.lessonMeta}>
                              Late submission deadline: {formatDeadline(cl.lateDeadline)} · {describeLatePenalty(cl)}
                            </p>
                          )}
                          <Link href={`/student/assignments/${cl.id}`}>Open assignment and submit work</Link>
                          {lesson.summary && <p className={styles.lessonSummary}>{lesson.summary}</p>}
                        </div>

                        {lesson.lessonNodes.length > 0 && (
                          <ul className={styles.nodeList}>
                            {lesson.lessonNodes.map((ln) => {
                              const quizBankCount = ln.node._count.quizQuestions;
                              const checkpointQuestionCount = ln.node.checkpoints.reduce(
                                (sum, checkpoint) => sum + checkpoint._count.questions,
                                0
                              );
                              const access = getFoundationalAccess({
                                isFoundational: ln.isRequired,
                                hasCheckpoints: ln.node.checkpoints.length > 0,
                                hasQuizBank: quizBankCount > 0,
                              });

                              return (
                                <li key={ln.id} className={styles.nodeChip}>
                                  <div className={styles.nodePreviewWrapper}>
                                    {access.qevSkipped ? (
                                      <p className={styles.qevStatusMessage}>Skipped — passed foundational quiz</p>
                                    ) : access.qevLocked ? (
                                      <p className={styles.qevStatusMessage}>Complete the quiz to unlock this lesson</p>
                                    ) : (
                                      <NodePreview node={ln.node} />
                                    )}
                                  </div>
                                  <StudentQuizTaskList
                                    isFoundational={ln.isRequired}
                                    quizBankCount={quizBankCount}
                                    checkpointQuestionCount={checkpointQuestionCount}
                                    attempts={
                                      cl.progress?.[0]?.attempts.filter((attempt) => attempt.lessonNodeId === ln.id) ??
                                      []
                                    }
                                    lessonNodeId={ln.id}
                                    assignmentId={cl.id}
                                  />
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
