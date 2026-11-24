import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const db = new PrismaClient();
const studentId = 'spark-browser-student';
test.beforeAll(async () => {
  await db.user.upsert({
    where: { id: studentId },
    update: {},
    create: { id: studentId, email: 'spark-browser-student@example.com', name: 'Browser Student', appRole: 'STUDENT' },
  });
});
test.afterAll(async () => {
  await db.$disconnect();
});

async function fixture(video = false) {
  const tag = randomUUID();
  const node = await db.node.create({
    data: {
      title: `Browser node ${tag}`,
      ...(video
        ? {
            videoUrl: 'https://example.com/test-video',
            checkpoints: {
              create: {
                checkpointKey: tag,
                sortOrder: 0,
                timeOffsetSeconds: 10,
                questions: {
                  create: {
                    sortOrder: 0,
                    prompt: 'Checkpoint answer',
                    options: ['Wrong', 'Right'],
                    correctIndices: [1],
                  },
                },
              },
            },
          }
        : {
            quizQuestions: {
              create: {
                sortOrder: 0,
                prompt: 'Original quiz question',
                options: ['Wrong', 'Right'],
                correctIndices: [1],
              },
            },
          }),
    },
  });
  const lesson = await db.lesson.create({
    data: {
      title: `Browser lesson ${tag}`,
      summary: '',
      lessonNodes: {
        create: { nodeId: node.id, sortOrder: 0, isRequired: !video, passingPercent: 70, quizQuestionCount: 1 },
      },
    },
    include: { lessonNodes: true },
  });
  const course = await db.course.create({
    data: {
      code: `BROWSER-${tag}`,
      title: `Browser course ${tag}`,
      enrollments: { create: { studentId } },
      courseLessons: { create: { lessonId: lesson.id, dueDate: new Date(Date.now() + 3600000), hideAfterDue: false } },
    },
    include: { courseLessons: true },
  });
  const assignmentId = course.courseLessons[0].id;
  const lessonUrl = `/student/courses/${course.id}/lessons/${assignmentId}`;
  const nodeUrl = `${lessonUrl}/nodes/${lesson.lessonNodes[0].id}`;
  const attempts = () => db.nodeAttempt.findMany({ where: { userId: studentId, courseLessonId: assignmentId } });
  const submissions = () =>
    db.lessonSubmission.findMany({
      where: { progress: { studentId, courseLessonId: assignmentId } },
      orderBy: { number: 'asc' },
    });
  return { node, course, assignmentId, lessonUrl, nodeUrl, attempts, submissions };
}
async function finishQuiz(page: Page, answer = 'Right') {
  await page.getByRole('radio', { name: new RegExp(`${answer}$`) }).click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Node Complete', exact: true })).toBeVisible();
}

test('submits through the student screens, resumes one improvement attempt and shows the retained gradebook grade', async ({
  page,
}) => {
  const f = await fixture();
  await page.goto(f.nodeUrl);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await finishQuiz(page);
  await page.getByRole('link', { name: 'Improve grade', exact: true }).click();
  await expect(page.getByRole('radio', { name: /Right$/ })).toBeVisible();
  const firstId = (await f.attempts()).find((a) => a.purpose === 'IMPROVEMENT')!.id;
  await page.reload();
  await finishQuiz(page, 'Wrong');
  expect((await f.attempts()).filter((a) => a.purpose === 'IMPROVEMENT').map((a) => a.id)).toEqual([firstId]);
  await expect(page.getByRole('link', { name: 'Improve grade', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Return to Lesson', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Best result retained' })).toBeVisible();
  const history = await f.submissions();
  expect(history.map((s) => s.finalPercent)).toEqual([100, 0]);
  await page.goto(`/instructor/courses/${f.course.id}/gradebook`);
  await expect(page.getByRole('heading', { name: 'Gradebook', exact: true })).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
});

test('reopens changed content through the roadmap and resubmits while preserving the old receipt', async ({ page }) => {
  const f = await fixture();
  await page.goto(f.nodeUrl);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await finishQuiz(page);
  const old = (await f.submissions())[0];
  await db.quizQuestion.updateMany({ where: { nodeId: f.node.id }, data: { prompt: 'Updated quiz question' } });
  await page.goto(f.lessonUrl);
  await page.getByRole('link', { name: `Start updated work: ${f.node.title}` }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Updated quiz question', { exact: true })).toBeVisible();
  await finishQuiz(page);
  const history = await f.submissions();
  expect(history).toHaveLength(2);
  expect(history[0]).toEqual(old);
  await page.goto(f.lessonUrl);
  await expect(page.getByRole('heading', { name: 'Updated work required' })).toHaveCount(0);
});

test('retains checkpoint drafts through reload and submits only after video completion', async ({ page }) => {
  const f = await fixture(true);
  await page.goto(`${f.nodeUrl}/video`);
  await page.getByRole('button', { name: 'Advance to checkpoint' }).click();
  await page.getByRole('radio', { name: /Right$/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(/All answers saved/)).toBeVisible();
  expect(await f.submissions()).toHaveLength(0);
  expect((await f.attempts())[0].completedAt).toBeNull();
  await page.reload();
  await expect(page.getByText(/All answers saved/)).toBeVisible();
  await page.getByRole('button', { name: 'Reach video end' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Node Complete', exact: true })).toBeVisible();
  expect((await f.submissions())[0].gradingStatus).toBe('COMPLETION_ONLY');
  const attempt = (await f.attempts())[0];
  await page.request.post(`/api/student/assignments/${f.assignmentId}`, {
    data: { action: 'saveCheckpoint', attemptId: attempt.id, videoEnded: true },
  });
  expect(await f.submissions()).toHaveLength(1);
});

test('closing the window during playback retains answers without submitting', async ({ page }) => {
  const f = await fixture(true);
  await page.goto(`${f.nodeUrl}/video`);
  await page.getByRole('button', { name: 'Advance to checkpoint' }).click();
  await page.getByRole('radio', { name: /Right$/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(/All answers saved/)).toBeVisible();
  await db.courseLesson.update({
    where: { id: f.assignmentId },
    data: { dueDate: new Date(0), lateDeadline: new Date(1) },
  });
  await page.getByRole('button', { name: 'Reach video end' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Submissions are not accepted' })).toBeVisible();
  const attempt = (await f.attempts())[0];
  expect(attempt.completedAt).toBeNull();
  expect(attempt.draftAnswers).toHaveLength(1);
  expect(await f.submissions()).toHaveLength(0);
});
