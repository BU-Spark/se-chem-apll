// Clearly fictional, additive fixtures. Never overwrite existing student activity.
module.exports = async function seedSubmissions(prisma) {
  const assignments = await prisma.courseLesson.findMany({
    where: { course: { code: { in: ['DEMO-CHEM-101', 'DEMO-CHEM-201'] } } },
    include: {
      course: true,
      lesson: {
        include: {
          lessonNodes: {
            orderBy: { sortOrder: 'asc' },
            include: { node: { include: { quizQuestions: { orderBy: { sortOrder: 'asc' } } } } },
          },
        },
      },
    },
  });
  for (const assignment of assignments) {
    const students = await prisma.enrollment.findMany({
      where: {
        courseId: assignment.courseId,
        role: 'STUDENT',
        student: { OR: [{ email: { startsWith: 'demo.roster.' } }, { email: 'student.demo@example.com' }] },
      },
      include: { student: true },
      orderBy: { studentId: 'asc' },
      take: 4,
    });
    for (let i = 0; i < students.length; i++) {
      const studentId = students[i].studentId;
      if (
        await prisma.courseLessonProgress.findUnique({
          where: { studentId_courseLessonId: { studentId, courseLessonId: assignment.id } },
        })
      )
        continue;
      await prisma.$transaction(async (tx) => {
        const progress = await tx.courseLessonProgress.create({
          data: {
            studentId,
            courseLessonId: assignment.id,
            status: i === 2 ? 'IN_PROGRESS' : 'COMPLETED',
            percentComplete: i === 2 ? 40 : 100,
            startedAt: new Date(),
          },
        });
        if (i === 2) return;
        // Two historical policies deliberately illustrate independent course results.
        for (let number = 1; number <= (i === 1 ? 2 : 1); number++) {
          const submittedAt = new Date(Date.now() - (3 - number) * 3600000);
          const dueDate = new Date(submittedAt.getTime() - number * 3600000);
          const policy = {
            openDate: null,
            dueDate: dueDate.toISOString(),
            lateDeadline: new Date(submittedAt.getTime() + 86400000).toISOString(),
            hideAfterDue: false,
            latePenaltyType: assignment.course.code === 'DEMO-CHEM-101' ? 'HOURLY' : 'FIXED',
            latePenaltyPercent: assignment.course.code === 'DEMO-CHEM-101' ? 2 : 10,
          };
          const score = i === 0 ? 0 : number === 1 ? 100 : 0;
          const nodes = [],
            attemptIds = [];
          for (const node of assignment.lesson.lessonNodes.filter((n) => n.node.quizQuestions.length)) {
            const questions = node.node.quizQuestions.slice(0, node.quizQuestionCount);
            const snapshot = {
              nodeTitle: node.node.title,
              lessonNodeId: node.id,
              passingPercent: node.passingPercent,
              kind: 'QUIZ',
              questions,
            };
            const attempt = await tx.nodeAttempt.create({
              data: {
                progressId: progress.id,
                courseLessonId: assignment.id,
                userId: studentId,
                lessonNodeId: node.id,
                kind: 'QUIZ',
                contentKey: 'fictional-demo-history',
                idempotencyKey: `demo-${number}-${node.id}`,
                snapshot: JSON.parse(JSON.stringify(snapshot)),
                startedAt: new Date(submittedAt.getTime() - 600000),
              },
            });
            for (const q of questions) {
              await tx.nodeResponse.create({
                data: {
                  attemptId: attempt.id,
                  studentId,
                  questionKey: q.id,
                  quizQuestionId: q.id,
                  snapshot: { prompt: q.prompt, options: q.options, correctIndices: q.correctIndices },
                  selectedIndices: score === 100 ? q.correctIndices : [],
                  rawAnswer: score === 100 ? null : '[fictional demo answer]',
                  isCorrect: score === 100,
                },
              });
            }
            await tx.nodeAttempt.update({
              where: { id: attempt.id },
              data: { completedAt: submittedAt, score, isPassing: score >= node.passingPercent },
            });
            nodes.push({ title: node.node.title, attemptId: attempt.id, score, passingPercent: node.passingPercent });
            attemptIds.push(attempt.id);
          }
          const rawPercent = nodes.length ? score : null;
          const penaltyPercent = policy.latePenaltyType === 'HOURLY' ? 2 * number : 10;
          await tx.lessonSubmission.create({
            data: {
              progressId: progress.id,
              number,
              idempotencyKey: `demo-submission-${number}`,
              submittedAt,
              gradingStatus: rawPercent === null ? 'COMPLETION_ONLY' : 'GRADED',
              rawPercent,
              penaltyPercent,
              finalPercent: rawPercent === null ? null : rawPercent * (1 - penaltyPercent / 100),
              passed: nodes.every((n) => score >= n.passingPercent),
              snapshot: {
                version: 1,
                fictional: true,
                courseTitle: assignment.course.title,
                lessonTitle: assignment.lesson.title,
                courseLessonId: assignment.id,
                lessonId: assignment.lessonId,
                policy,
                hoursLate: number,
                nodes,
                attemptIds,
              },
              attempts: { create: attemptIds.map((attemptId) => ({ attemptId })) },
            },
          });
        }
        await tx.courseLessonProgress.update({ where: { id: progress.id }, data: { completedAt: new Date() } });
      });
    }
  }
};
