/* eslint-disable @typescript-eslint/no-require-imports */
// Additive, repeatable fixtures for a real Clerk-linked user in the local development database.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadEnvConfig } = require('@next/env');
const { PrismaClient } = require('@prisma/client');

loadEnvConfig(process.cwd());
const emailIndex = process.argv.indexOf('--email');
const email = process.argv[emailIndex + 1]?.trim().toLowerCase();
assert(emailIndex >= 0 && email?.includes('@'), 'Usage: npm run db:seed:flow -- --email person@example.com');
const url = new URL(process.env.DATABASE_URL);
assert(
  ['postgres:', 'postgresql:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    url.pathname === '/spark_dev',
  'This script only writes to the local spark_dev database.'
);
assert(
  !url.searchParams.has('host') || ['localhost', '127.0.0.1', '::1'].includes(url.searchParams.get('host')),
  'Remote host overrides are not allowed.'
);
const prisma = new PrismaClient();
const specs = [
  {
    title: 'Atoms and ions',
    summary: 'Identify atomic particles and predict ionic charge.',
    nodes: [
      {
        key: 'particles',
        title: 'Atomic particles',
        objective: 'Identify the charge of a proton, neutron, and electron.',
        prompt: 'Which particle has a positive charge?',
        choices: ['Proton', 'Neutron', 'Electron'],
        answer: 0,
        numericPrompt: 'How many protons are in a carbon atom with atomic number 6?',
        numericAnswer: 6,
      },
      {
        key: 'ions',
        title: 'Forming ions',
        objective: 'Relate electron gain or loss to the charge of an ion.',
        prompt: 'An atom loses one electron. What charge does its ion have?',
        choices: ['+1', '0', '−1'],
        answer: 0,
        numericPrompt: 'An atom has 11 protons and 10 electrons. Enter its net charge.',
        numericAnswer: 1,
      },
    ],
  },
  {
    title: 'Moles and solutions',
    summary: 'Practice mole conversions and calculate solution concentration.',
    nodes: [
      {
        key: 'moles',
        title: 'Working with moles',
        objective: 'Convert between mass and amount in moles using molar mass.',
        prompt: 'Which expression gives the number of moles?',
        choices: ['Mass divided by molar mass', 'Mass multiplied by molar mass', 'Molar mass divided by volume'],
        answer: 0,
        numericPrompt: 'A sample has mass 36 g and molar mass 18 g/mol. How many moles are present?',
        numericAnswer: 2,
      },
      {
        key: 'molarity',
        title: 'Solution molarity',
        objective: 'Calculate molarity from moles of solute and liters of solution.',
        prompt: 'What are the units of molarity?',
        choices: ['g/L', 'mol/L', 'L/mol'],
        answer: 1,
        numericPrompt: 'A solution contains 0.5 mol of solute in 0.25 L. Enter its molarity in mol/L.',
        numericAnswer: 2,
      },
    ],
  },
  {
    title: 'Acids and bases',
    summary: 'Interpret the pH scale and reason about neutralization.',
    nodes: [
      {
        key: 'ph',
        title: 'Understanding pH',
        objective: 'Classify acidic and basic solutions using the pH scale.',
        prompt: 'At 25 °C, which solution is acidic?',
        choices: ['pH 3', 'pH 7', 'pH 11'],
        answer: 0,
        numericPrompt: 'What is the pH when the hydrogen ion concentration is 0.001 mol/L?',
        numericAnswer: 3,
      },
      {
        key: 'neutralization',
        title: 'Neutralization',
        objective: 'Use the one-to-one stoichiometry of a strong acid–base neutralization.',
        prompt: 'Which products form when hydrochloric acid reacts with sodium hydroxide?',
        choices: ['Sodium chloride and water', 'Hydrogen and oxygen', 'Carbon dioxide and water'],
        answer: 0,
        numericPrompt: 'How many moles of NaOH are needed to neutralize 2 mol of HCl?',
        numericAnswer: 2,
      },
    ],
  },
];

async function main() {
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  assert(
    user?.clerkUserId,
    'Sign in with this email first; the seed requires an existing Clerk-linked application user.'
  );
  const prefix = `local-flow-${createHash('sha256').update(user.id).digest('hex').slice(0, 16)}`;
  const owned = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, role: 'OWNER', workspace: { name: 'Chemistry' } },
    orderBy: { createdAt: 'asc' },
    select: { workspaceId: true },
  });
  const now = new Date();
  const openDate = new Date(now.getTime() - 86400000);
  const result = await prisma.$transaction(async (tx) => {
    const workspace = owned
      ? await tx.workspace.findUniqueOrThrow({ where: { id: owned.workspaceId } })
      : await tx.workspace.upsert({
          where: { id: `${prefix}-workspace` },
          update: {},
          create: {
            id: `${prefix}-workspace`,
            name: 'Chemistry flow testing',
            members: { create: { userId: user.id, role: 'OWNER' } },
          },
        });
    const course = await tx.course.upsert({
      where: { id: `${prefix}-course` },
      update: {},
      create: {
        id: `${prefix}-course`,
        code: 'LOCAL-CHEM-FLOW',
        section: prefix.slice(-8),
        title: 'Chemistry — flow testing',
        description: 'Local test course with three open lessons, sample videos, checkpoints, and quizzes.',
        createdByClerkId: user.clerkUserId,
      },
    });
    const enrollment = await tx.enrollment.upsert({
      where: { studentId_courseId: { studentId: user.id, courseId: course.id } },
      update: {},
      create: { studentId: user.id, courseId: course.id, role: 'STUDENT' },
    });
    assert.equal(
      enrollment.role,
      'STUDENT',
      'The reserved fixture enrollment has been changed. No updates were saved.'
    );
    const lessons = [];
    for (const [lessonIndex, spec] of specs.entries()) {
      const nodes = [];
      for (const node of spec.nodes) {
        const row = await tx.node.upsert({
          where: { id: `${prefix}-${node.key}` },
          update: {},
          create: {
            id: `${prefix}-${node.key}`,
            workspaceId: workspace.id,
            createdByClerkId: user.clerkUserId,
            title: node.title,
            summary: '[local-flow] Published sample content for testing the learning flow.',
            isDraft: false,
            estimatedMinutes: 8,
            videoUrl: 'https://www.youtube.com/watch?v=FSyAehMdpyI',
            tags: ['Chemistry', 'Flow testing'],
            learningObjectives: [node.objective],
            checkpoints: {
              create: {
                sortOrder: 0,
                timeOffsetSeconds: 15,
                checkpointKey: 'quick-check',
                questions: {
                  create: [
                    {
                      sortOrder: 0,
                      kind: 'NOTE',
                      prompt: `Learning objective: ${node.objective}`,
                      options: { type: 'note' },
                      correctIndices: [],
                    },
                    {
                      sortOrder: 1,
                      prompt: node.prompt,
                      options: { type: 'multipleChoice', choices: node.choices },
                      correctIndices: [node.answer],
                      feedbackCorrect: 'Correct. Continue to the next part of the lesson.',
                      feedbackIncorrect: 'Review the concept and try again.',
                    },
                  ],
                },
              },
            },
            quizQuestions: {
              create: [
                {
                  sortOrder: 0,
                  prompt: node.prompt,
                  options: { type: 'multipleChoice', choices: node.choices },
                  correctIndices: [node.answer],
                  feedbackCorrect: 'Correct.',
                  feedbackIncorrect: 'Review the learning objective before trying again.',
                },
                {
                  sortOrder: 1,
                  prompt: node.numericPrompt,
                  options: { type: 'shortAnswer', answerMode: 'exact', expectedAnswer: node.numericAnswer },
                  correctIndices: [],
                  feedbackCorrect: 'Correct.',
                  feedbackIncorrect: 'Check the quantities and units in the question.',
                },
              ],
            },
          },
        });
        assert.equal(row.workspaceId, workspace.id, 'A fixture node was moved. No updates were saved.');
        assert.equal(
          row.isDraft,
          false,
          'A fixture node was made a draft. Use another fixture set instead of overwriting it.'
        );
        nodes.push(row);
      }
      const lessonId = `${prefix}-lesson-${lessonIndex + 1}`;
      const lesson = await tx.lesson.upsert({
        where: { id: lessonId },
        update: {},
        create: {
          id: lessonId,
          workspaceId: workspace.id,
          createdByClerkId: user.clerkUserId,
          title: spec.title,
          slug: `${lessonId}-chemistry`,
          summary: spec.summary,
          description:
            '[local-flow] Two-node roadmap with a foundational quiz, video checkpoint, and follow-up quiz. Sample video is provided for testing.',
          estimatedMinutes: 16,
          isDraft: false,
          lessonNodes: {
            create: nodes.map((node, i) => ({
              id: `${lessonId}-node-${i + 1}`,
              nodeId: node.id,
              sortOrder: i,
              passingPercent: 50,
              quizQuestionCount: 2,
              isRequired: i === 0,
            })),
          },
        },
      });
      assert.equal(lesson.workspaceId, workspace.id, 'A fixture lesson was moved. No updates were saved.');
      assert.equal(lesson.isDraft, false, 'A fixture lesson was made a draft. No updates were saved.');
      await tx.lessonNodeEdge.upsert({
        where: { sourceId_targetId: { sourceId: `${lessonId}-node-1`, targetId: `${lessonId}-node-2` } },
        update: {},
        create: { lessonId, sourceId: `${lessonId}-node-1`, targetId: `${lessonId}-node-2` },
      });
      const dueDate = new Date(now.getTime() + [7, 10, 14][lessonIndex] * 86400000);
      const assignment = await tx.courseLesson.upsert({
        where: { courseId_lessonId: { courseId: course.id, lessonId } },
        update: {
          openDate,
          dueDate,
          hideAfterDue: false,
          lateDeadline: null,
          latePenaltyType: 'NONE',
          latePenaltyPercent: 0,
        },
        create: { courseId: course.id, lessonId, sortOrder: lessonIndex, openDate, dueDate, hideAfterDue: false },
      });
      lessons.push({
        title: lesson.title,
        dueDate: dueDate.toISOString(),
        studentPath: `/student/courses/${course.id}/lessons/${assignment.id}`,
      });
    }
    return {
      workspace: { name: workspace.name, path: `/workspaces/${workspace.id}` },
      course: {
        title: course.title,
        studentPath: `/student/courses/${course.id}`,
        instructorPath: `/instructor/courses/${course.id}/edit`,
      },
      lessons,
    };
  });
  console.log(JSON.stringify({ email: user.email, appRoleUnchanged: user.appRole, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
