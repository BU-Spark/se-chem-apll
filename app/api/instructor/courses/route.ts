import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

// GET /api/instructor/courses
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const courses = await prisma.course.findMany({
    where: {
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: {
      enrollments: true,
      contacts: true,
      courseLessons: {
        include: { lesson: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(courses);
}

// POST /api/instructor/courses
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      sortOrder: number;
    }>;
  };

  if (!code?.trim()) return NextResponse.json({ error: 'code is required' }, { status: 422 });
  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 422 });

  // Validate code format (e.g., CH101, CHEM-200)
  if (!/^[A-Z0-9-]+$/i.test(code)) {
    return NextResponse.json({ error: 'code must contain only letters, numbers, and hyphens' }, { status: 422 });
  }

  // Check for duplicate code+section combination
  const existing = await prisma.course.findFirst({
    where: {
      code: code.trim().toUpperCase(),
      section: section?.trim() || null,
    },
  });

  if (existing) {
    return NextResponse.json({ error: 'A course with this code and section already exists' }, { status: 409 });
  }

  const lessonInputs = lessons ?? [];

  for (const row of lessonInputs) {
    if (!row.lessonId) {
      return NextResponse.json({ error: 'Each imported lesson needs a lessonId' }, { status: 422 });
    }
    if (row.openDate && row.dueDate && new Date(row.openDate) >= new Date(row.dueDate)) {
      return NextResponse.json({ error: 'Open date must be before due date' }, { status: 422 });
    }
  }

  const course = await prisma.course.create({
    data: {
      code: code.trim().toUpperCase(),
      section: section?.trim() || null,
      title: title.trim(),
      createdByClerkId: userId,
      description: description?.trim() || null,
      courseLessons: {
        create: lessonInputs.map((row) => ({
          lessonId: row.lessonId,
          openDate: row.openDate ? new Date(row.openDate) : null,
          dueDate: row.dueDate ? new Date(row.dueDate) : null,
          sortOrder: row.sortOrder,
        })),
      },
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

  return NextResponse.json(course, { status: 201 });
}
