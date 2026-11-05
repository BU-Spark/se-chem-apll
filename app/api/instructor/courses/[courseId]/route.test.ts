/** @jest-environment node */
jest.mock('@/lib/auth/content', () => ({ referencedContentAllowed: async () => true }));
import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import { PATCH } from './route';
import { Prisma } from '@prisma/client';

const mockCourseFindFirst = jest.fn();
const mockCourseUpdate = jest.fn();
const mockLessonFindFirst = jest.fn();
const mockContactFindMany = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    course: {
      findFirst: (...args: unknown[]) => mockCourseFindFirst(...args),
      update: (...args: unknown[]) => mockCourseUpdate(...args),
    },
    courseLesson: { count: jest.fn().mockResolvedValue(0) },
    lesson: { findFirst: (...args: unknown[]) => mockLessonFindFirst(...args) },
    courseContact: { findMany: (...args: unknown[]) => mockContactFindMany(...args) },
  },
}));

const context = { params: Promise.resolve({ courseId: 'course-1' }) };

function patchRequest(body: unknown) {
  return { json: async () => body };
}

describe('PATCH /api/instructor/courses/[courseId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'instructor-1' }));
    mockCourseFindFirst.mockResolvedValue({ id: 'course-1' });
    mockLessonFindFirst.mockResolvedValue(null);
    mockCourseUpdate.mockResolvedValue({ id: 'course-1' });
    mockContactFindMany.mockResolvedValue([{ id: 'contact-1' }]);
  });

  it('creates and updates normalized instructor contacts while removing omitted instructors only', async () => {
    const response = await PATCH(
      patchRequest({
        instructorContacts: [
          {
            id: 'contact-1',
            name: ' Jane Smith ',
            email: ' Jane@Example.com ',
            officeHours: ' Mondays · SCI 201 · 2–4 PM ',
          },
          { name: 'Ali Khan', email: 'ali@example.com', officeHours: '' },
        ],
      }) as never,
      context
    );
    expect(response.status).toBe(200);
    expect(mockContactFindMany).toHaveBeenCalledWith({
      where: { courseId: 'course-1', type: 'INSTRUCTOR', id: { in: ['contact-1'] } },
      select: { id: true },
    });
    expect(mockCourseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          contacts: {
            deleteMany: { type: 'INSTRUCTOR', id: { notIn: ['contact-1'] } },
            create: [{ type: 'INSTRUCTOR', name: 'Ali Khan', email: 'ali@example.com', officeHours: null }],
            update: [
              {
                where: { id: 'contact-1', courseId: 'course-1', type: 'INSTRUCTOR' },
                data: {
                  name: 'Jane Smith',
                  email: 'jane@example.com',
                  officeHours: 'Mondays · SCI 201 · 2–4 PM',
                },
              },
            ],
          },
        },
      })
    );
  });

  it('clears office hours without deleting the instructor', async () => {
    const response = await PATCH(
      patchRequest({
        instructorContacts: [{ id: 'contact-1', name: 'Jane', email: 'jane@example.com', officeHours: '   ' }],
      }) as never,
      context
    );
    expect(response.status).toBe(200);
    expect(mockCourseUpdate.mock.calls[0][0].data.contacts.update[0].data.officeHours).toBeNull();
  });

  it('removes all instructors but preserves checkers with an empty array', async () => {
    await PATCH(patchRequest({ instructorContacts: [] }) as never, context);
    expect(mockCourseUpdate.mock.calls[0][0].data.contacts).toEqual({
      deleteMany: { type: 'INSTRUCTOR', id: { notIn: [] } },
      create: [],
      update: [],
    });
  });

  it('leaves all contacts untouched when the payload omits them', async () => {
    await PATCH(patchRequest({ title: 'Updated title' }) as never, context);
    expect(mockCourseUpdate.mock.calls[0][0].data).not.toHaveProperty('contacts');
    expect(mockContactFindMany).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    [null],
    [{ name: '', email: 'jane@example.com' }],
    [{ name: 'Jane', email: 'invalid' }],
    [{ name: 123, email: 'jane@example.com' }],
    [{ name: 'Jane', email: 'jane@example.com', officeHours: 123 }],
    [{ name: 'Jane', email: 'jane@example.com', officeHours: 'x'.repeat(2001) }],
    [{ name: 'x'.repeat(201), email: 'jane@example.com' }],
    [{ name: 'Jane', email: `${'a'.repeat(250)}@example.com` }],
    [{ id: '', name: 'Jane', email: 'jane@example.com' }],
    [1, 2].map(() => ({ id: 'contact-1', name: 'Jane', email: 'jane@example.com' })),
  ])('rejects invalid contacts before writing (%j)', async (instructorContacts) => {
    const response = await PATCH(patchRequest({ instructorContacts }) as never, context);
    expect(response.status).toBe(422);
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it.each(['another-course-contact', 'checker-contact'])('rejects unavailable instructor ID %s', async (id) => {
    mockContactFindMany.mockResolvedValue([]);
    const response = await PATCH(
      patchRequest({ instructorContacts: [{ id, name: 'Jane', email: 'jane@example.com' }] }) as never,
      context
    );
    expect(response.status).toBe(422);
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it('returns 422 when an instructor is deleted after the availability check', async () => {
    mockCourseUpdate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
        code: 'P2025',
        clientVersion: '6.17.0',
      })
    );

    const response = await PATCH(
      patchRequest({
        instructorContacts: [{ id: 'contact-1', name: 'Jane', email: 'jane@example.com' }],
      }) as never,
      context
    );

    expect(mockContactFindMany).toHaveBeenCalled();
    expect(mockCourseUpdate).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Instructor contacts are unavailable.' });
  });

  it.each([
    { code: 'P2002', body: { instructorContacts: [{ id: 'contact-1', name: 'Jane', email: 'jane@example.com' }] } },
    { code: 'P2025', body: { title: 'Updated title' } },
    { code: 'P2025', body: { instructorContacts: [] } },
  ])('propagates unrelated database errors (%j)', async ({ code, body }) => {
    const error = new Prisma.PrismaClientKnownRequestError('Database error', {
      code,
      clientVersion: '6.17.0',
    });
    mockCourseUpdate.mockRejectedValueOnce(error);

    await expect(PATCH(patchRequest(body) as never, context)).rejects.toBe(error);
  });

  it.each([null, appUser({ appRole: 'STUDENT' })])('denies contact changes without instructor access', async (user) => {
    mockGetAppUser.mockResolvedValue(user);
    const response = await PATCH(patchRequest({ instructorContacts: [] }) as never, context);
    expect(response.status).toBe(user ? 403 : 401);
    expect(mockCourseUpdate).not.toHaveBeenCalled();
    expect(mockCourseFindFirst).not.toHaveBeenCalled();
  });

  it('denies contact changes to courses outside the instructor scope', async () => {
    mockCourseFindFirst.mockResolvedValue(null);
    const response = await PATCH(patchRequest({ instructorContacts: [] }) as never, context);
    expect(response.status).toBe(404);
    expect(mockCourseFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'course-1',
        OR: [{ createdByClerkId: 'instructor-1' }, { createdByClerkId: null }],
      },
    });
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it('rejects a draft lesson before updating course relationships', async () => {
    mockLessonFindFirst.mockResolvedValue({ id: 'draft-lesson' });

    const response = await PATCH(
      patchRequest({ lessons: [{ lessonId: 'draft-lesson', sortOrder: 0 }] }) as never,
      context
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Draft lessons cannot be added to a course.' });
    expect(mockLessonFindFirst).toHaveBeenCalledWith({
      where: { id: { in: ['draft-lesson'] }, isDraft: true },
      select: { id: true },
    });
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });
  it.each([
    { lateDeadline: '2026-10-14T12:00:00Z', hideAfterDue: true },
    { lateDeadline: '2026-10-11T12:00:00Z' },
    { latePenaltyPercent: 101 },
    { latePenaltyType: 'HOURLY', lateDeadline: null },
    { dueDate: 'not-a-date' },
  ])('rejects invalid policy before writing: %j', async (patch) => {
    const response = await PATCH(
      patchRequest({
        lessons: [
          {
            lessonId: 'lesson-1',
            sortOrder: 0,
            dueDate: '2026-10-12T12:00:00Z',
            lateDeadline: '2026-10-14T12:00:00Z',
            hideAfterDue: false,
            latePenaltyType: 'HOURLY',
            latePenaltyPercent: 1,
            ...patch,
          },
        ],
      }) as never,
      context
    );
    expect(response.status).toBe(422);
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it('persists the daily rate, visibility, and exact deadlines', async () => {
    const response = await PATCH(
      patchRequest({
        lessons: [
          {
            lessonId: 'lesson-1',
            sortOrder: 0,
            dueDate: '2026-10-12T12:00:00Z',
            lateDeadline: '2026-10-14T12:00:00Z',
            hideAfterDue: false,
            latePenaltyType: 'DAILY',
            latePenaltyPercent: 10,
          },
        ],
      }) as never,
      context
    );
    expect(response.status).toBe(200);
    expect(mockCourseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseLessons: expect.objectContaining({
            upsert: [
              expect.objectContaining({
                create: expect.objectContaining({
                  dueDate: new Date('2026-10-12T12:00:00Z'),
                  lateDeadline: new Date('2026-10-14T12:00:00Z'),
                  hideAfterDue: false,
                  latePenaltyType: 'DAILY',
                  latePenaltyPercent: 10,
                }),
              }),
            ],
          }),
        }),
      })
    );
  });
});
