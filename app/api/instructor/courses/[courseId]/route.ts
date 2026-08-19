import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

// GET /api/instructor/courses/[courseId]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId } = await params;
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code, section, title, description, lessons } = body as {
    code?: string;
    section?: string | null;
    title?: string;
    description?: string | null;
    lessons?: Array<{
      lessonId: string;
      openDate?: string | null;
      dueDate?: string | null;
      accessibleAfterDue?: boolean;
      sortOrder: number;
    }>;
  };

  const owned = await prisma.course.findFirst({
    where: {
      id: courseId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
      if (row.openDate && row.dueDate && new Date(row.openDate) >= new Date(row.dueDate)) {
        return NextResponse.json({ error: 'Open date must be before due date' }, { status: 422 });
      }
    }
  }

  const course = await prisma.course.update({
    where: { id: courseId },
    data: {
      ...(code !== undefined && { code: code.trim().toUpperCase() }),
      ...(section !== undefined && { section: section?.trim() || null }),
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(lessons !== undefined && {
        courseLessons: {
          deleteMany: {},
          create: lessons.map((row) => ({
            lessonId: row.lessonId,
            openDate: row.openDate ? new Date(row.openDate) : null,
            dueDate: row.dueDate ? new Date(row.dueDate) : null,
            accessibleAfterDue: row.accessibleAfterDue ?? false,
            sortOrder: row.sortOrder,
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
}

// DELETE /api/instructor/courses/[courseId]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId } = await params;

  const owned = await prisma.course.findFirst({
    where: {
      id: courseId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.course.delete({ where: { id: courseId } });
  return new NextResponse(null, { status: 204 });
}
