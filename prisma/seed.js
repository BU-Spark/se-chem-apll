/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const YOUTUBE_URLS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=J---aiyznGQ',
  'https://www.youtube.com/watch?v=9bZkp7q19f0',
  'https://www.youtube.com/watch?v=3JZ_D3ELwOQ',
  'https://www.youtube.com/watch?v=L_jWHffIx5E',
  'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
];

function pickRandomYoutube() {
  return YOUTUBE_URLS[Math.floor(Math.random() * YOUTUBE_URLS.length)];
}

function lessonSlug(base) {
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createDemoNode(index) {
  return prisma.node.create({
    data: {
      title: `Demo Node ${index}`,
      summary: '[seed-demo] Example learning node',
      videoUrl: pickRandomYoutube(),
      estimatedMinutes: 8 + index,
      questions: {
        create: [
          {
            sortOrder: 0,
            prompt: `Pre-quiz question for demo node ${index}`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctIndices: [1],
            isPreLecture: true,
          },
          {
            sortOrder: 1,
            prompt: `Checkpoint question for demo node ${index}`,
            options: ['True', 'False'],
            correctIndices: [0],
            isPreLecture: false,
            timeOffsetSeconds: 90,
          },
        ],
      },
    },
  });
}

async function createDemoLesson({ courseId, title, summary, sortOrder, nodes }) {
  const lesson = await prisma.lesson.create({
    data: {
      title,
      slug: lessonSlug(title.toLowerCase().replace(/\s+/g, '-')),
      summary,
      description: '[seed-demo] Example lesson with a simple roadmap.',
      estimatedMinutes: 45,
      lessonNodes: {
        create: nodes.map((node, idx) => ({
          nodeId: node.id,
          sortOrder: idx,
          passingPercent: 70,
          quizQuestionCount: 1,
          isRequired: true,
        })),
      },
    },
    include: {
      lessonNodes: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  await prisma.courseLesson.create({
    data: {
      courseId,
      lessonId: lesson.id,
      openDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      sortOrder,
    },
  });

  if (lesson.lessonNodes.length > 1) {
    const edges = [];
    for (let i = 0; i < lesson.lessonNodes.length - 1; i += 1) {
      edges.push({
        lessonId: lesson.id,
        sourceId: lesson.lessonNodes[i].id,
        targetId: lesson.lessonNodes[i + 1].id,
      });
    }
    await prisma.lessonNodeEdge.createMany({ data: edges });
  }

  return lesson;
}

async function main() {
  // Clean up prior demo data created by this seed.
  const demoCourses = await prisma.course.findMany({
    where: { code: { startsWith: 'DEMO-' } },
    select: { id: true },
  });
  if (demoCourses.length > 0) {
    await prisma.course.deleteMany({
      where: { id: { in: demoCourses.map((c) => c.id) } },
    });
  }

  await prisma.lesson.deleteMany({
    where: { description: { contains: '[seed-demo]' } },
  });

  await prisma.node.deleteMany({
    where: { summary: { contains: '[seed-demo]' } },
  });

  const demoNodes = [];
  for (let i = 1; i <= 6; i += 1) {
    demoNodes.push(await createDemoNode(i));
  }

  const courses = [
    {
      code: 'DEMO-CHEM-101',
      section: 'A1',
      title: 'Demo General Chemistry',
      description: '[seed-demo] Intro chemistry sample course',
      lessons: [
        { title: 'Atoms and Molecules', summary: 'Foundations of chemistry concepts.' },
        { title: 'Chemical Reactions', summary: 'Balancing and reaction types.' },
      ],
    },
    {
      code: 'DEMO-CHEM-201',
      section: 'B1',
      title: 'Demo Applied Chemistry',
      description: '[seed-demo] Applied chemistry sample course',
      lessons: [
        { title: 'Acids and Bases', summary: 'pH, neutralization, and applications.' },
        { title: 'Thermochemistry Basics', summary: 'Heat transfer and energy changes.' },
      ],
    },
  ];

  const createdCourseIds = [];
  const createdLessonIds = [];

  for (const courseData of courses) {
    const course = await prisma.course.create({
      data: {
        code: courseData.code,
        section: courseData.section,
        title: courseData.title,
        description: courseData.description,
      },
    });
    createdCourseIds.push(course.id);

    for (let i = 0; i < courseData.lessons.length; i += 1) {
      const lessonSpec = courseData.lessons[i];
      const start = (i * 3) % demoNodes.length;
      const lessonNodes = demoNodes.slice(start, start + 3);

      const lesson = await createDemoLesson({
        courseId: course.id,
        title: lessonSpec.title,
        summary: lessonSpec.summary,
        sortOrder: i,
        nodes: lessonNodes,
      });
      createdLessonIds.push(lesson.id);
    }
  }

  const demoStudent = await prisma.user.upsert({
    where: { email: 'student.demo@example.com' },
    update: { name: 'Demo Student' },
    create: {
      email: 'student.demo@example.com',
      name: 'Demo Student',
    },
  });

  await prisma.enrollment.createMany({
    data: createdCourseIds.map((courseId) => ({
      studentId: demoStudent.id,
      courseId,
      role: 'STUDENT',
    })),
    skipDuplicates: true,
  });

  const createdLessons = await prisma.lesson.findMany({
    where: { id: { in: createdLessonIds } },
    orderBy: { createdAt: 'asc' },
    include: {
      lessonNodes: {
        orderBy: { sortOrder: 'asc' },
        include: {
          node: {
            include: {
              questions: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
    },
  });

  for (let i = 0; i < createdLessons.length; i += 1) {
    const lesson = createdLessons[i];
    const status = i % 3 === 0 ? 'COMPLETED' : i % 3 === 1 ? 'IN_PROGRESS' : 'NOT_STARTED';
    const percentComplete = status === 'COMPLETED' ? 100 : status === 'IN_PROGRESS' ? 45 : 0;

    await prisma.lessonProgress.upsert({
      where: {
        studentId_lessonId: {
          studentId: demoStudent.id,
          lessonId: lesson.id,
        },
      },
      update: {
        status,
        percentComplete,
        startedAt: status !== 'NOT_STARTED' ? new Date() : null,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
      create: {
        studentId: demoStudent.id,
        lessonId: lesson.id,
        status,
        percentComplete,
        startedAt: status !== 'NOT_STARTED' ? new Date() : null,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
    });

    const primaryLessonNode = lesson.lessonNodes[0];
    if (!primaryLessonNode) continue;

    const preQuestions = primaryLessonNode.node.questions.filter((q) => q.isPreLecture);
    const regularQuestions = primaryLessonNode.node.questions.filter((q) => !q.isPreLecture);

    if (preQuestions.length > 0) {
      const preAttempt = await prisma.nodeAttempt.create({
        data: {
          lessonNodeId: primaryLessonNode.id,
          userId: demoStudent.id,
          isPassing: true,
          score: 100,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      await prisma.nodeResponse.createMany({
        data: preQuestions.map((q) => ({
          attemptId: preAttempt.id,
          questionId: q.id,
          studentId: demoStudent.id,
          selectedIndices: [1],
          isCorrect: true,
        })),
      });
    }

    if (regularQuestions.length > 0) {
      const shouldFail = i % 2 === 0;

      const quizAttempt = await prisma.nodeAttempt.create({
        data: {
          lessonNodeId: primaryLessonNode.id,
          userId: demoStudent.id,
          isPassing: !shouldFail,
          score: shouldFail ? 50 : 100,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      await prisma.nodeResponse.createMany({
        data: regularQuestions.map((q) => ({
          attemptId: quizAttempt.id,
          questionId: q.id,
          studentId: demoStudent.id,
          selectedIndices: [shouldFail ? 1 : 0],
          isCorrect: !shouldFail,
        })),
      });
    }
  }

  console.log(
    'Seed complete: demo courses, lessons, nodes, roadmap edges, YouTube videos, and student pre-quiz/quiz attempts created.'
  );
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
