import { POST } from './route';

const mockApiAccess = jest.fn();
const mockLessonNodeFindFirst = jest.fn();
const mockProgressUpsert = jest.fn();

jest.mock('@/lib/auth/api', () => ({ apiAccess: () => mockApiAccess() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    lessonNode: { findFirst: (...args: unknown[]) => mockLessonNodeFindFirst(...args) },
    nodeVideoProgress: { upsert: (...args: unknown[]) => mockProgressUpsert(...args) },
  },
}));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}));

const context = { params: Promise.resolve({ assignmentId: 'cl-1' }) };
const request = (body: unknown) => ({ json: async () => body }) as never;
const key = { studentId: 'student-1', courseLessonId: 'cl-1', lessonNodeId: 'ln1' };

describe('POST /api/student/assignments/[assignmentId]/video-progress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiAccess.mockResolvedValue({ user: { id: 'student-1' } });
    mockLessonNodeFindFirst.mockResolvedValue({ id: 'ln1' });
  });

  it("saves the position for a published node of the student's lesson", async () => {
    expect((await POST(request({ nodeId: 'ln1', positionSeconds: 42.5 }), context)).status).toBe(200);

    expect(mockLessonNodeFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'ln1',
        node: { isDraft: false },
        lesson: {
          isDraft: false,
          courseLessons: {
            some: { id: 'cl-1', course: { enrollments: { some: { studentId: 'student-1', role: 'STUDENT' } } } },
          },
        },
      },
      select: { id: true },
    });
    expect(mockProgressUpsert).toHaveBeenCalledWith({
      where: { studentId_courseLessonId_lessonNodeId: key },
      create: { ...key, positionSeconds: 42.5 },
      update: { positionSeconds: 42.5 },
    });
  });

  it('also records the time when a video without questions was watched to the end', async () => {
    await POST(request({ nodeId: 'ln1', positionSeconds: 0, watched: true }), context);
    expect(mockProgressUpsert).toHaveBeenCalledWith({
      where: { studentId_courseLessonId_lessonNodeId: key },
      create: { ...key, positionSeconds: 0, watchedAt: expect.any(Date) },
      update: { positionSeconds: 0, watchedAt: expect.any(Date) },
    });
  });

  it('returns the access error when signed out or not a student', async () => {
    mockApiAccess.mockResolvedValue({ error: { status: 401 } });
    expect((await POST(request({ nodeId: 'ln1', positionSeconds: 1 }), context)).status).toBe(401);
    expect(mockProgressUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', null],
    ['no nodeId', { positionSeconds: 1 }],
    ['no position', { nodeId: 'ln1' }],
    ['a text position', { nodeId: 'ln1', positionSeconds: '10' }],
    ['a negative position', { nodeId: 'ln1', positionSeconds: -1 }],
    ['an impossible position', { nodeId: 'ln1', positionSeconds: 1e9 }],
    ['watched that is not true/false', { nodeId: 'ln1', positionSeconds: 0, watched: 'yes' }],
  ])('returns 400 for %s', async (_, body) => {
    expect((await POST(request(body), context)).status).toBe(400);
    expect(mockProgressUpsert).not.toHaveBeenCalled();
  });

  it('returns 404 for a node that is not in a lesson the student can see', async () => {
    mockLessonNodeFindFirst.mockResolvedValue(null);
    expect((await POST(request({ nodeId: 'other', positionSeconds: 1 }), context)).status).toBe(404);
    expect(mockProgressUpsert).not.toHaveBeenCalled();
  });
});
