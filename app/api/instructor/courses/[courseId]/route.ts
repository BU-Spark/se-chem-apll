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
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      lessons: { orderBy: { sortOrder: 'asc' } },
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

  const { code, section, title, description } = body as {
    code?: string;
    section?: string | null;
    title?: string;
    description?: string | null;
  };

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

  const course = await prisma.course.update({
    where: { id: courseId },
    data: {
      ...(code !== undefined && { code: code.trim().toUpperCase() }),
      ...(section !== undefined && { section: section?.trim() || null }),
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
    },
    include: {
      lessons: { orderBy: { sortOrder: 'asc' } },
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
  await prisma.course.delete({ where: { id: courseId } });
  return new NextResponse(null, { status: 204 });
}
