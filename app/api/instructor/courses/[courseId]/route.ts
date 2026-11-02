import { referencedContentAllowed } from '@/lib/auth/content';
import { NextRequest, NextResponse } from 'next/server';
import { apiAccess, contentScope } from '@/lib/auth/api';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { parseInstructorContacts, type InstructorContactInput } from '@/app/utils/courseContacts';
import { lessonPolicyData, validateLessonPolicy, type LessonPolicyInput } from '@/app/utils/lessonSubmissionPolicy';

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

// GET /api/instructor/courses/[courseId]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  const { courseId } = await params;
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      ...contentScope(user),
    },
    include: {
      courseLessons: {
        include: { lesson: true },
        orderBy: { sortOrder: 'asc' },
      },
      enrollments: true,
      contacts: true,
    },
  });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(course);
}

// PATCH /api/instructor/courses/[courseId]
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  const { courseId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid course payload' }, { status: 400 });
  }
  const { code, section, title, description, lessons, instructorContacts } = body as {
    instructorContacts?: unknown;
    code?: string;
    section?: string | null;
    title?: string;
    description?: string | null;
    lessons?: Array<
      LessonPolicyInput & {
        lessonId: string;
        sortOrder: number;
      }
    >;
  };

  const owned = await prisma.course.findFirst({
    where: {
      id: courseId,
      ...contentScope(user),
    },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let contacts: InstructorContactInput[] | undefined;
  if (instructorContacts !== undefined) {
    const parsed = parseInstructorContacts(instructorContacts);
    if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 422 });
    contacts = parsed.contacts;
    const ids = contacts.flatMap((contact) => (contact.id ? [contact.id] : []));
    if (ids.length > 0) {
      const existing = await prisma.courseContact.findMany({
        where: { courseId, type: 'INSTRUCTOR', id: { in: ids } },
        select: { id: true },
      });
      if (existing.length !== ids.length) {
        return NextResponse.json({ error: 'Instructor contacts are unavailable.' }, { status: 422 });
      }
    }
  }

  // If code or section is being updated, check for duplicates
  if (code !== undefined || section !== undefined) {
    const currentCourse = await prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!currentCourse) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const newCode = code !== undefined ? code.trim().toUpperCase() : currentCourse.code;
    const newSection = section !== undefined ? section?.trim() || null : currentCourse.section;

    // Only check for duplicates if code or section actually changed
    if (newCode !== currentCourse.code || newSection !== currentCourse.section) {
      const existing = await prisma.course.findFirst({
        where: {
          code: newCode,
          section: newSection,
        },
      });

      if (existing && existing.id !== courseId) {
        return NextResponse.json({ error: 'A course with this code and section already exists' }, { status: 409 });
      }
    }
  }

  if (lessons !== undefined) {
    for (const row of lessons) {
      if (!row.lessonId) {
        return NextResponse.json({ error: 'Each imported lesson needs a lessonId' }, { status: 422 });
      }
      const policyError = validateLessonPolicy(row);
      if (policyError) return NextResponse.json({ error: policyError }, { status: 422 });
    }

    const lessonIds = [...new Set(lessons.map((row) => row.lessonId))];
    if (lessonIds.length > 0) {
      if (!(await referencedContentAllowed('lesson', lessonIds, user)))
        return NextResponse.json({ error: 'Referenced lessons are unavailable.' }, { status: 403 });

      const draftLesson = await prisma.lesson.findFirst({
        where: { id: { in: lessonIds }, isDraft: true },
        select: { id: true },
      });
      if (draftLesson) {
        return NextResponse.json({ error: 'Draft lessons cannot be added to a course.' }, { status: 422 });
      }
    }
  }

  if (
    lessons !== undefined &&
    (await prisma.courseLesson.count({
      where: { courseId, lessonId: { notIn: lessons.map((row) => row.lessonId) }, progress: { some: {} } },
    }))
  ) {
    return NextResponse.json({ error: 'Assignments with student activity cannot be removed.' }, { status: 409 });
  }
  try {
    const course = await prisma.course.update({
      where: { id: courseId },
      data: {
        ...(contacts !== undefined && {
          contacts: {
            deleteMany: {
              type: 'INSTRUCTOR',
              id: { notIn: contacts.flatMap((contact) => (contact.id ? [contact.id] : [])) },
            },
            create: contacts
              .filter((contact) => !contact.id)
              .map(({ name, email, officeHours }) => ({
                type: 'INSTRUCTOR' as const,
                name,
                email,
                officeHours,
              })),
            update: contacts
              .filter((contact) => contact.id)
              .map(({ id, name, email, officeHours }) => ({
                where: { id, courseId, type: 'INSTRUCTOR' as const },
                data: { name, email, officeHours },
              })),
          },
        }),
        ...(code !== undefined && { code: code.trim().toUpperCase() }),
        ...(section !== undefined && { section: section?.trim() || null }),
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(lessons !== undefined && {
          courseLessons: {
            deleteMany: { lessonId: { notIn: lessons.map((row) => row.lessonId) } },
            upsert: lessons.map((row) => ({
              where: { courseId_lessonId: { courseId, lessonId: row.lessonId } },
              create: { lessonId: row.lessonId, ...lessonPolicyData(row), sortOrder: row.sortOrder },
              update: { ...lessonPolicyData(row), sortOrder: row.sortOrder },
            })),
          },
        }),
      },
      include: {
        courseLessons: {
          include: { lesson: true },
          orderBy: { sortOrder: 'asc' },
        },
        enrollments: true,
        contacts: true,
      },
    });

    return NextResponse.json(course);
  } catch (error) {
    // A submitted instructor may have been deleted after the availability check.
    if (
      contacts?.some((contact) => contact.id) &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Instructor contacts are unavailable.' }, { status: 422 });
    }
    throw error;
  }
}

// DELETE /api/instructor/courses/[courseId]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  const { courseId } = await params;

  const owned = await prisma.course.findFirst({
    where: {
      id: courseId,
      ...contentScope(user),
    },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (await prisma.courseLessonProgress.count({ where: { courseLesson: { courseId } } }))
    return NextResponse.json({ error: 'Courses with student activity cannot be deleted.' }, { status: 409 });
  await prisma.course.delete({ where: { id: courseId } });
  return new NextResponse(null, { status: 204 });
}
