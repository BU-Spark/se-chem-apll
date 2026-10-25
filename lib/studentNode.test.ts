import { canOpenQuiz, canWatchVideo, getStudentNode, nodeScreen } from './studentNode';

const mockGetStudentLessonRoadmap = jest.fn();
const mockGetStudentCourse = jest.fn();
const mockLessonNodeFindUnique = jest.fn();
const mockAttemptFindMany = jest.fn();

jest.mock('@/lib/studentLessonRoadmap', () => ({
  getStudentLessonRoadmap: (...args: unknown[]) => mockGetStudentLessonRoadmap(...args),
}));
jest.mock('@/lib/studentCourses', () => ({
  ...jest.requireActual('@/lib/studentCourses'),
  getStudentCourse: (...args: unknown[]) => mockGetStudentCourse(...args),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    lessonNode: { findUniqueOrThrow: (...args: unknown[]) => mockLessonNodeFindUnique(...args) },
    nodeAttempt: { findMany: (...args: unknown[]) => mockAttemptFindMany(...args) },
  },
}));

describe('nodeScreen', () => {
  it.each([
    ['LOCKED', 0, false, 'LOCKED'],
    ['COMPLETED', 1, true, 'COMPLETE'],
    ['NOT_STARTED', 0, false, 'QUIZ'],
    ['NOT_STARTED', 1, false, 'REFRESH'],
    ['NOT_STARTED', 1, true, 'VIDEO_RESULT'],
    ['NOT_STARTED', 2, false, 'RETRY'],
    ['NOT_STARTED', 2, true, 'VIDEO_RESULT'],
    ['INCOMPLETE', 3, false, 'INCOMPLETE'],
  ] as const)(
    'foundational: %s with %i failed quizzes, video watched=%p shows %s',
    (status, failedQuizzes, watched, screen) => {
      expect(nodeScreen(status, { isFoundational: true, failedQuizzes, watchedVideoSinceFail: watched })).toBe(screen);
    }
  );

  it.each([
    ['LOCKED', 0, false, 'LOCKED'],
    ['NOT_STARTED', 0, false, 'INTRO'],
    ['NOT_STARTED', 0, true, 'VIDEO_RESULT'],
    ['NOT_STARTED', 1, true, 'RETRY'],
    ['COMPLETED', 0, true, 'COMPLETE'],
    ['INCOMPLETE', 2, true, 'INCOMPLETE'],
  ] as const)(
    'regular: %s with %i failed quizzes, video watched=%p shows %s',
    (status, failedQuizzes, watched, screen) => {
      expect(nodeScreen(status, { isFoundational: false, failedQuizzes, watchedVideoSinceFail: watched })).toBe(screen);
    }
  );
});

describe('canWatchVideo and canOpenQuiz', () => {
  it('opens the video from the intro or after a failed quiz', () => {
    expect(canWatchVideo('QUIZ')).toBe(false);
    expect(canWatchVideo('INTRO')).toBe(true);
    expect(canWatchVideo('REFRESH')).toBe(true);
    expect(canWatchVideo('RETRY')).toBe(true);
    expect(canWatchVideo('VIDEO_RESULT')).toBe(true);
    expect(canWatchVideo('COMPLETE')).toBe(false);
  });

  it('opens the quiz after the video lesson, or right away when the video has no questions', () => {
    expect(canOpenQuiz('VIDEO_RESULT', true, true)).toBe(true);
    expect(canOpenQuiz('REFRESH', true, true)).toBe(false);
    expect(canOpenQuiz('REFRESH', false, true)).toBe(true);
    expect(canOpenQuiz('INTRO', true, false)).toBe(false);
    expect(canOpenQuiz('INTRO', false, false)).toBe(true);
    expect(canOpenQuiz('QUIZ', false, true)).toBe(false);
    expect(canOpenQuiz('INCOMPLETE', false, true)).toBe(false);
  });

  it("sends a regular node's retry straight to the quiz, and a foundational one through the video", () => {
    expect(canOpenQuiz('RETRY', true, false)).toBe(true);
    expect(canOpenQuiz('RETRY', true, true)).toBe(false);
  });
});

describe('getStudentNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStudentLessonRoadmap.mockResolvedValue({
      courseTitle: 'Course #3',
      lessonTitle: 'Lesson 2',
      nodes: [{ id: 'ln1', title: 'Atoms', isFoundational: true, status: 'NOT_STARTED' }],
      edges: [],
    });
    mockLessonNodeFindUnique.mockResolvedValue({
      passingPercent: 60,
      node: {
        learningObjectives: ['Balance equations.'],
        videoUrl: 'https://youtu.be/abc',
        muxPlaybackId: null,
        checkpoints: [
          { timeOffsetSeconds: 30, questions: [{ id: 'cq1' }] },
          { timeOffsetSeconds: null, questions: [{ id: 'cq2' }] },
        ],
      },
    });
    mockGetStudentCourse.mockResolvedValue({
      lessons: [
        { id: 'a', number: 1, title: 'A', status: 'COMPLETED', nodeCount: 1, finishedNodeCount: 1 },
        { id: 'b', number: 2, title: 'B', status: 'NOT_STARTED', nodeCount: 1, finishedNodeCount: 0 },
      ],
    });
  });

  it('returns null for a node the student cannot see in this lesson', async () => {
    expect(await getStudentNode('student-1', 'course-1', 'cl-1', 'other-node')).toBeNull();
    mockGetStudentLessonRoadmap.mockResolvedValue(null);
    expect(await getStudentNode('student-1', 'course-1', 'cl-1', 'ln1')).toBeNull();
  });

  const at = (minute: number) => new Date(`2026-10-24T12:${String(minute).padStart(2, '0')}:00Z`);
  const quiz = (minute: number, isPassing: boolean, correct: number, total: number) => ({
    kind: 'QUIZ',
    isPassing,
    completedAt: at(minute),
    responses: Array.from({ length: total }, (_, i) => ({ isCorrect: i < correct })),
  });
  const video = (minute: number, correct: number, total: number) => ({
    kind: 'CHECKPOINT',
    isPassing: true,
    completedAt: at(minute),
    responses: Array.from({ length: total }, (_, i) => ({ isCorrect: i < correct })),
  });

  it('shows Refresh after a first failed quiz, with the score, objectives, video, and course progress', async () => {
    mockAttemptFindMany.mockResolvedValue([quiz(10, false, 1, 3)]);

    expect(await getStudentNode('student-1', 'course-1', 'cl-1', 'ln1')).toEqual({
      courseTitle: 'Course #3',
      lessonTitle: 'Lesson 2',
      node: {
        id: 'ln1',
        title: 'Atoms',
        isFoundational: true,
        status: 'NOT_STARTED',
        learningObjectives: ['Balance equations.'],
      },
      screen: 'REFRESH',
      lastQuiz: { correct: 1, total: 3 },
      lastVideo: undefined,
      video: { url: 'https://youtu.be/abc', muxPlaybackId: null },
      questionTimes: { cq1: 30, cq2: null },
      hasVideoQuestions: true,
      coursePercent: 50,
    });
  });

  it('shows the video result after the video lesson, passed at the node pass mark', async () => {
    mockAttemptFindMany.mockResolvedValue([video(20, 3, 5), quiz(10, false, 1, 3)]);
    expect(await getStudentNode('student-1', 'course-1', 'cl-1', 'ln1')).toMatchObject({
      screen: 'VIDEO_RESULT',
      lastVideo: { correct: 3, total: 5, passed: true },
    });

    mockAttemptFindMany.mockResolvedValue([video(20, 2, 5), quiz(10, false, 1, 3)]);
    expect(await getStudentNode('student-1', 'course-1', 'cl-1', 'ln1')).toMatchObject({
      lastVideo: { correct: 2, total: 5, passed: false },
    });
  });

  it('ignores a video watched before the quiz was failed', async () => {
    mockAttemptFindMany.mockResolvedValue([quiz(30, false, 0, 3), video(20, 5, 5)]);
    expect(await getStudentNode('student-1', 'course-1', 'cl-1', 'ln1')).toMatchObject({ screen: 'REFRESH' });
  });

  it('shows a regular node the intro first, then the video result after the video lesson', async () => {
    mockGetStudentLessonRoadmap.mockResolvedValue({
      courseTitle: 'Course #3',
      lessonTitle: 'Lesson 2',
      nodes: [{ id: 'ln1', title: 'Atoms', isFoundational: false, status: 'NOT_STARTED' }],
      edges: [],
    });
    mockAttemptFindMany.mockResolvedValue([]);
    expect(await getStudentNode('student-1', 'course-1', 'cl-1', 'ln1')).toMatchObject({ screen: 'INTRO' });

    mockAttemptFindMany.mockResolvedValue([video(20, 4, 5)]);
    expect(await getStudentNode('student-1', 'course-1', 'cl-1', 'ln1')).toMatchObject({
      screen: 'VIDEO_RESULT',
      lastVideo: { correct: 4, total: 5, passed: true },
    });
  });

  it('shows the quiz when the node has not been tried yet', async () => {
    mockAttemptFindMany.mockResolvedValue([]);
    expect(await getStudentNode('student-1', 'course-1', 'cl-1', 'ln1')).toMatchObject({
      screen: 'QUIZ',
      lastQuiz: undefined,
    });
  });
});
