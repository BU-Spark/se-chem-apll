import { GET } from './route';
const mockAuth = jest.fn(),
  mockUser = jest.fn(),
  mockAssignment = jest.fn(),
  mockProgress = jest.fn(),
  mockAttempt = jest.fn(),
  mockSubmissions = jest.fn(),
  mockBest = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({ auth: () => mockAuth(), currentUser: () => mockUser() }));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    courseLesson: { findFirst: (...a: unknown[]) => mockAssignment(...a) },
    courseLessonProgress: { findUnique: (...a: unknown[]) => mockProgress(...a) },
    nodeAttempt: { findFirst: (...a: unknown[]) => mockAttempt(...a), findMany: async () => [] },
    lessonSubmission: {
      findFirst: (...a: unknown[]) => mockBest(...a),
      findMany: (...a: unknown[]) => mockSubmissions(...a),
    },
  },
}));
const context = { params: Promise.resolve({ courseId: 'c1' }) };
const req = (q = 'studentId=s1&assignmentId=cl1') => ({ url: `http://localhost/?${q}` }) as Request;
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: 'i1' });
  mockUser.mockResolvedValue({ unsafeMetadata: { role: 'instructor' } });
  mockAssignment.mockResolvedValue({ id: 'cl1' });
  mockProgress.mockResolvedValue({ id: 'p1', status: 'COMPLETED', percentComplete: 100 });
  mockBest.mockResolvedValue({ id: 'best' });
  mockSubmissions.mockResolvedValue([]);
  mockAttempt.mockResolvedValue(null);
});
it('requires instructor authentication before reading results', async () => {
  mockAuth.mockResolvedValue({ userId: null });
  expect((await GET(req(), context)).status).toBe(401);
  mockAuth.mockResolvedValue({ userId: 's1' });
  mockUser.mockResolvedValue({ unsafeMetadata: { role: 'student' } });
  expect((await GET(req(), context)).status).toBe(403);
  expect(mockAssignment).not.toHaveBeenCalled();
});
it('scopes assignment, enrolled student and course ownership', async () => {
  mockAssignment.mockResolvedValue(null);
  expect((await GET(req(), context)).status).toBe(404);
  expect(mockAssignment).toHaveBeenCalledWith({
    where: {
      id: 'cl1',
      courseId: 'c1',
      course: {
        OR: [{ createdByClerkId: 'i1' }, { createdByClerkId: null }],
        enrollments: { some: { studentId: 's1', role: 'STUDENT' } },
      },
    },
    select: { id: true },
  });
  expect(mockProgress).not.toHaveBeenCalled();
});
it('pages immutable submissions and retains the best result identifier', async () => {
  mockSubmissions.mockResolvedValue(Array.from({ length: 26 }, (_, i) => ({ id: `s${i}`, finalPercent: 0 })));
  const body = await (await GET(req(), context)).json();
  expect(body.submissions).toHaveLength(25);
  expect(body.nextCursor).toBe('s24');
  expect(body.bestId).toBe('best');
  expect(body.submissions[0].finalPercent).toBe(0);
  expect(mockProgress).toHaveBeenCalledWith(
    expect.objectContaining({ where: { studentId_courseLessonId: { studentId: 's1', courseLessonId: 'cl1' } } })
  );
});
it('restricts attempt answers to the course-specific progress', async () => {
  expect((await GET(req('studentId=s1&assignmentId=cl1&attemptId=a1'), context)).status).toBe(404);
  expect(mockAttempt).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'a1', progressId: 'p1' },
      select: expect.objectContaining({
        responses: expect.objectContaining({ select: expect.objectContaining({ snapshot: true }) }),
      }),
    })
  );
});
it('returns an empty result without progress and rejects incomplete requests', async () => {
  expect((await GET(req('studentId=s1'), context)).status).toBe(400);
  mockProgress.mockResolvedValue(null);
  expect((await (await GET(req(), context)).json()).submissions).toEqual([]);
});
