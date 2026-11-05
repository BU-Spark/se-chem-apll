import { computeNodeStatuses, getStudentLessonRoadmap } from './studentLessonRoadmap';

const mockCourseLessonFindFirst = jest.fn();
const mockAttemptFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    courseLesson: { findFirst: (...args: unknown[]) => mockCourseLessonFindFirst(...args) },
    nodeAttempt: { findMany: (...args: unknown[]) => mockAttemptFindMany(...args) },
  },
}));

const now = new Date('2026-10-24T12:00:00Z');
const finishedAt = new Date('2026-10-24T11:00:00Z');
const quiz = (lessonNodeId: string, isPassing: boolean) => ({
  lessonNodeId,
  kind: 'QUIZ',
  isPassing,
  completedAt: finishedAt,
});

describe('computeNodeStatuses', () => {
  // a → b → c, and a → d
  const edges = [
    { sourceId: 'a', targetId: 'b' },
    { sourceId: 'b', targetId: 'c' },
    { sourceId: 'a', targetId: 'd' },
  ];

  it('unlocks only start nodes when nothing is complete', () => {
    expect(computeNodeStatuses(['a', 'b', 'c', 'd'], edges, new Set(), new Set())).toEqual({
      a: 'NOT_STARTED',
      b: 'LOCKED',
      c: 'LOCKED',
      d: 'LOCKED',
    });
  });

  it('unlocks a node once every node pointing to it is complete', () => {
    expect(computeNodeStatuses(['a', 'b', 'c', 'd'], edges, new Set(['a']), new Set())).toEqual({
      a: 'COMPLETED',
      b: 'NOT_STARTED',
      c: 'LOCKED',
      d: 'NOT_STARTED',
    });
  });

  it('shows a started node as in progress, but keeps a started node locked while its prerequisites are open', () => {
    const statuses = computeNodeStatuses(['a', 'b', 'c', 'd'], edges, new Set(), new Set(), new Set(['a', 'c']));
    expect(statuses.a).toBe('IN_PROGRESS');
    expect(statuses.c).toBe('LOCKED');
  });

  it('keeps a node with two incoming arrows locked until both are complete', () => {
    const join = [
      { sourceId: 'a', targetId: 'c' },
      { sourceId: 'b', targetId: 'c' },
    ];
    expect(computeNodeStatuses(['a', 'b', 'c'], join, new Set(['a']), new Set()).c).toBe('LOCKED');
    expect(computeNodeStatuses(['a', 'b', 'c'], join, new Set(['a', 'b']), new Set()).c).toBe('NOT_STARTED');
  });

  it('marks a node incomplete after every quiz try failed, and lets the next node unlock', () => {
    expect(computeNodeStatuses(['a', 'b', 'c', 'd'], edges, new Set(), new Set(['a']))).toEqual({
      a: 'INCOMPLETE',
      b: 'NOT_STARTED',
      c: 'LOCKED',
      d: 'NOT_STARTED',
    });
  });
});

describe('getStudentLessonRoadmap', () => {
  const courseLesson = (overrides: Record<string, unknown> = {}) => ({
    dueDate: null,
    hideAfterDue: false,
    course: { title: 'Course #3' },
    lesson: {
      title: 'Lesson 2',
      lessonNodes: [
        { id: 'ln1', isRequired: true, node: { title: 'Atoms' } },
        { id: 'ln2', isRequired: false, node: { title: 'Bonds' } },
      ],
      lessonNodeEdges: [
        { sourceId: 'ln1', targetId: 'ln2' },
        { sourceId: 'ln2', targetId: 'draft-node' },
      ],
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAttemptFindMany.mockResolvedValue([]);
  });

  it('returns null when the student cannot see this lesson in this course', async () => {
    mockCourseLessonFindFirst.mockResolvedValue(null);
    expect(await getStudentLessonRoadmap('student-1', 'course-1', 'cl-1', now)).toBeNull();
    expect(mockCourseLessonFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'cl-1',
          courseId: 'course-1',
          lesson: { isDraft: false },
          course: { enrollments: { some: { studentId: 'student-1', role: 'STUDENT' } } },
        },
      })
    );
  });

  it('returns null for a lesson hidden after its due date', async () => {
    mockCourseLessonFindFirst.mockResolvedValue(
      courseLesson({ hideAfterDue: true, dueDate: new Date('2026-10-01T00:00:00Z') })
    );
    expect(await getStudentLessonRoadmap('student-1', 'course-1', 'cl-1', now)).toBeNull();
  });

  it("maps nodes with type and status from the student's quizzes, dropping arrows to draft nodes", async () => {
    mockCourseLessonFindFirst.mockResolvedValue(courseLesson());
    mockAttemptFindMany.mockResolvedValue([quiz('ln1', true)]);

    expect(await getStudentLessonRoadmap('student-1', 'course-1', 'cl-1', now)).toEqual({
      courseTitle: 'Course #3',
      lessonTitle: 'Lesson 2',
      nodes: [
        { id: 'ln1', title: 'Atoms', isFoundational: true, status: 'COMPLETED' },
        { id: 'ln2', title: 'Bonds', isFoundational: false, status: 'NOT_STARTED' },
      ],
      edges: [{ sourceId: 'ln1', targetId: 'ln2' }],
    });
    expect(mockAttemptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'student-1', courseLessonId: 'cl-1', kind: { in: ['QUIZ', 'CHECKPOINT'] } },
      })
    );
  });

  it('makes a foundational node incomplete only after three failed tries', async () => {
    mockCourseLessonFindFirst.mockResolvedValue(courseLesson());
    const fail = quiz('ln1', false);
    mockAttemptFindMany.mockResolvedValue([fail, fail]);
    expect((await getStudentLessonRoadmap('student-1', 'course-1', 'cl-1', now))!.nodes[0].status).toBe('IN_PROGRESS');

    mockAttemptFindMany.mockResolvedValue([fail, fail, fail]);
    const roadmap = await getStudentLessonRoadmap('student-1', 'course-1', 'cl-1', now);
    expect(roadmap!.nodes.map((node) => node.status)).toEqual(['INCOMPLETE', 'NOT_STARTED']);
  });

  it('shows a node in progress once a quiz or video-question try started', async () => {
    mockCourseLessonFindFirst.mockResolvedValue(courseLesson());
    mockAttemptFindMany.mockResolvedValue([
      { lessonNodeId: 'ln1', kind: 'CHECKPOINT', isPassing: null, completedAt: null },
    ]);
    expect((await getStudentLessonRoadmap('student-1', 'course-1', 'cl-1', now))!.nodes[0].status).toBe('IN_PROGRESS');

    mockAttemptFindMany.mockResolvedValue([quiz('ln1', false)]);
    expect((await getStudentLessonRoadmap('student-1', 'course-1', 'cl-1', now))!.nodes[0].status).toBe('IN_PROGRESS');
  });

  it('makes a regular node incomplete after two failed tries', async () => {
    mockCourseLessonFindFirst.mockResolvedValue(courseLesson());
    const failRegular = quiz('ln2', false);
    mockAttemptFindMany.mockResolvedValue([quiz('ln1', true), failRegular, failRegular]);
    const roadmap = await getStudentLessonRoadmap('student-1', 'course-1', 'cl-1', now);
    expect(roadmap!.nodes.map((node) => node.status)).toEqual(['COMPLETED', 'INCOMPLETE']);
  });
});
