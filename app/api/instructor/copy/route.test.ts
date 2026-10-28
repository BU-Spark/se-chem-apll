/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import { copyLessonFixture, copyNodeFixture } from '@/test/fixtures/contentCopy';
import { prisma } from '@/lib/prisma';

const mockAccess = jest.fn();
jest.mock('@/lib/auth/api', () => ({
  apiAccess: () => mockAccess(),
  contentScope: () => ({ createdByClerkId: 'owner' }),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    course: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    lesson: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    node: { findMany: jest.fn(), create: jest.fn() },
    lessonNodeEdge: { createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
const db = jest.mocked(prisma);
const source = {
  id: 'source',
  courseLessons: [
    {
      lessonId: copyLessonFixture.id,
      sortOrder: 0,
      openDate: new Date('2026-01-01T12:00Z'),
      dueDate: new Date('2026-01-02T12:00Z'),
      lateDeadline: new Date('2026-01-03T12:00Z'),
      hideAfterDue: false,
      latePenaltyType: 'FIXED',
      latePenaltyPercent: 5,
      lesson: copyLessonFixture,
    },
  ],
};
const request = (body: unknown) =>
  new NextRequest('http://localhost/api/instructor/copy', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  jest.resetAllMocks();
  mockAccess.mockResolvedValue({ user: { clerkUserId: 'owner' }, error: null });
  (db.course.findUnique as jest.Mock).mockResolvedValue(source);
  (db.lesson.findMany as jest.Mock).mockResolvedValue([copyLessonFixture]);
  (db.node.findMany as jest.Mock).mockResolvedValue([copyNodeFixture]);
  for (const [model, method] of [
    [db.node, 'create'],
    [db.lesson, 'create'],
    [db.lessonNodeEdge, 'createMany'],
    [db.course, 'create'],
    [db.course, 'update'],
    [db.lesson, 'update'],
  ] as const) {
    (model[method as keyof typeof model] as jest.Mock).mockImplementation((args: unknown) => ({ args }));
  }
});

it.each([401, 403])('enforces instructor access before querying content (%s)', async (status) => {
  mockAccess.mockResolvedValue({ error: NextResponse.json({ error: 'Denied' }, { status }) });
  expect((await POST(request({ mode: 'course', sourceCourseId: 'source' }))).status).toBe(status);
  expect(db.course.findUnique).not.toHaveBeenCalled();
});
it.each([
  null,
  [],
  { mode: 'other' },
  { mode: 'lessons', lessonIds: [] },
  { mode: 'nodes', nodeIds: [1] },
  { mode: 'course', sourceCourseId: 1 },
])('rejects malformed input without writing', async (body) => {
  expect((await POST(request(body))).status).toBe(422);
  expect(db.$transaction).not.toHaveBeenCalled();
});
it('duplicates another instructor’s course with new authoring records and the original schedule in one transaction', async () => {
  const response = await POST(
    request({ mode: 'course', sourceCourseId: 'source', code: 'CHEM', section: 'new', title: 'Copy' })
  );
  expect(response.status).toBe(201);
  expect(db.course.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'source' } }));
  expect(db.course.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      createdByClerkId: 'owner',
      code: 'CHEM',
      title: 'Copy',
      courseLessons: {
        create: [expect.objectContaining({ openDate: source.courseLessons[0].openDate, latePenaltyPercent: 5 })],
      },
    }),
  });
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect((db.$transaction as jest.Mock).mock.calls[0][0]).toHaveLength(4);
  expect((await response.json()).redirect).toMatch(/^\/instructor\/courses\/.+\/edit$/);
  const data = (db.course.create as jest.Mock).mock.calls[0][0].data;
  expect(data).not.toHaveProperty('enrollments');
  expect(data).not.toHaveProperty('contacts');
});
it('rejects a duplicate code/section before executing a transaction', async () => {
  (db.course.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });
  expect((await POST(request({ mode: 'course', sourceCourseId: 'source', code: 'CHEM', title: 'Copy' }))).status).toBe(
    409
  );
  expect(db.$transaction).not.toHaveBeenCalled();
});
it('blocks writes to another instructor’s destination', async () => {
  expect((await POST(request({ mode: 'lessons', lessonIds: ['lesson-old'], destinationId: 'private' }))).status).toBe(
    404
  );
  expect(db.course.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'private', createdByClerkId: 'owner' } })
  );
  expect(db.$transaction).not.toHaveBeenCalled();
});
it.each([false, true])('appends lessons with optional source schedules (%s)', async (copySchedule) => {
  (db.course.findFirst as jest.Mock).mockResolvedValue({ id: 'destination', courseLessons: [{ sortOrder: 4 }] });
  const response = await POST(
    request({
      mode: 'lessons',
      sourceCourseId: 'source',
      lessonIds: ['lesson-old'],
      destinationId: 'destination',
      copySchedule,
    })
  );
  expect(response.status).toBe(201);
  const row = (db.course.update as jest.Mock).mock.calls[0][0].data.courseLessons.create[0];
  expect(row.sortOrder).toBe(5);
  expect(row.lessonId).not.toBe('lesson-old');
  if (copySchedule) expect(row.openDate).toEqual(source.courseLessons[0].openDate);
  else expect(row).not.toHaveProperty('openDate');
});
it('copies nodes with question banks and appends source settings to a lesson', async () => {
  (db.lesson.findFirst as jest.Mock).mockResolvedValue({ id: 'destination', lessonNodes: [{ sortOrder: 3 }] });
  expect(
    (
      await POST(
        request({ mode: 'nodes', sourceCourseId: 'source', nodeIds: ['node-old'], destinationId: 'destination' })
      )
    ).status
  ).toBe(201);
  expect(db.lesson.update).toHaveBeenCalledWith({
    where: { id: 'destination' },
    data: {
      lessonNodes: {
        create: [expect.objectContaining({ sortOrder: 4, passingPercent: 85, quizQuestionCount: 1, isRequired: true })],
      },
    },
  });
  expect(db.node.create).toHaveBeenCalledTimes(1);
  expect(db.lesson.create).not.toHaveBeenCalled();
});
it('allows standalone library copies of draft nodes but rejects attaching them to lessons', async () => {
  (db.node.findMany as jest.Mock).mockResolvedValue([{ ...copyNodeFixture, isDraft: true }]);
  expect((await POST(request({ mode: 'nodes', nodeIds: ['node-old'] }))).status).toBe(201);
  (db.lesson.findFirst as jest.Mock).mockResolvedValue({ id: 'destination', lessonNodes: [] });
  expect((await POST(request({ mode: 'nodes', nodeIds: ['node-old'], destinationId: 'destination' }))).status).toBe(
    422
  );
  expect(db.$transaction).toHaveBeenCalledTimes(1);
});
it('reports failure without returning a successful redirect when the atomic transaction fails', async () => {
  (db.$transaction as jest.Mock).mockRejectedValue(new Error('connection failed'));
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const response = await POST(request({ mode: 'nodes', nodeIds: ['node-old'] }));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Unable to copy content. No changes were saved.' });
  spy.mockRestore();
});
