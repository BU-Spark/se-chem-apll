import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import styles from './page.module.css';
import StudentDailyTimeline from '@/app/components/StudentDailyTimeline/StudentDailyTimeline';
import NodePreview from '@/app/components/NodePreview/NodePreview';
import StudentQuizTaskList from '@/app/components/StudentQuizTaskList/StudentQuizTaskList';
import { getFoundationalAccess } from '@/app/utils/foundationalAccess';

export const dynamic = 'force-dynamic';

export default async function StudentHomePage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) redirect('/sign-in');

  const normalizedEmail = email.toLowerCase();

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
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: student.id },
    include: {
      course: {
        include: {
          lessons: {
            include: {
              lessonNodes: {
                include: {
                  node: {
                    include: {
                      _count: {
                        select: { quizQuestions: true },
                      },
                      checkpoints: {
                        select: {
                          _count: { select: { questions: true } },
                        },
                      },
                    },
                  },
                  attempts: {
                    where: { userId: student.id },
                    orderBy: { createdAt: 'desc' },
                    include: {
                      responses: {
                        select: {
                          quizQuestionId: true,
                          checkpointQuestionId: true,
                        },
                      },
                    },
                  },
                },
                orderBy: { sortOrder: 'asc' },
              },
              progress: {
                where: { studentId: student.id },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Build a lightweight "today" shape for the StudentDailyTimeline component
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const dailyEnrollments = enrollments
    .map(({ course }) => {
      const lessonsToday = course.lessons.filter(
        (lesson: {
          openDate?: Date | null;
          dueDate?: Date | null;
          progress?: { startedAt?: Date | null; completedAt?: Date | null }[];
        }) => {
          const open = lesson.openDate ? new Date(lesson.openDate) : null;
          const due = lesson.dueDate ? new Date(lesson.dueDate) : null;
          const progress = (lesson.progress && lesson.progress[0]) ?? null;
          const startedAt = progress?.startedAt ? new Date(progress.startedAt) : null;
          const completedAt = progress?.completedAt ? new Date(progress.completedAt) : null;

          const overlaps =
            (open && open <= todayEnd && (!due || due >= todayStart)) ||
            (startedAt && startedAt >= todayStart && startedAt <= todayEnd) ||
            (completedAt && completedAt >= todayStart && completedAt <= todayEnd);

          return overlaps;
        }
      );

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
                  {course.lessons.length} lesson{course.lessons.length !== 1 ? 's' : ''}
                </span>
              </div>

              {course.description && <p className={styles.courseDesc}>{course.description}</p>}

              {course.lessons.length === 0 ? (
                <p className={styles.noLessons}>No lessons assigned yet.</p>
              ) : (
                <ul className={styles.lessonList}>
                  {course.lessons.map((lesson) => {
                    const now = new Date();
                    const isUpcoming = lesson.openDate !== null && now < lesson.openDate;
                    const isClosed = lesson.dueDate !== null && now > lesson.dueDate;
                    const cardClass = isUpcoming || isClosed ? styles.lessonCardUnavailable : styles.lessonCard;

                    return (
                      <li key={lesson.id} className={cardClass}>
                        <div className={styles.lessonBody}>
                          <div className={styles.lessonTitleRow}>
                            <p className={styles.lessonTitle}>{lesson.title}</p>
                            {isUpcoming && (
                              <span className={`${styles.lessonStatus} ${styles.lessonStatusUpcoming}`}>
                                Opens {new Date(lesson.openDate!).toLocaleDateString()}
                              </span>
                            )}
                            {isClosed && (
                              <span className={`${styles.lessonStatus} ${styles.lessonStatusClosed}`}>Closed</span>
                            )}
                          </div>
                          <p className={styles.lessonMeta}>
                            {lesson.lessonNodes.length} node
                            {lesson.lessonNodes.length !== 1 ? 's' : ''}
                            {lesson.estimatedMinutes ? ` · ~${lesson.estimatedMinutes} min` : ''}
                            {lesson.openDate && !isUpcoming
                              ? ` · Opened ${new Date(lesson.openDate).toLocaleDateString()}`
                              : ''}
                            {lesson.dueDate && !isClosed
                              ? ` · Due ${new Date(lesson.dueDate).toLocaleDateString()}`
                              : ''}
                            {isClosed && lesson.dueDate
                              ? ` · Was due ${new Date(lesson.dueDate).toLocaleDateString()}`
                              : ''}
                          </p>
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
                                hasCheckpoints: checkpointQuestionCount > 0,
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
                                    attempts={ln.attempts}
                                    lessonNodeId={ln.id}
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
