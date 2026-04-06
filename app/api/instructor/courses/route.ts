import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

// GET /api/instructor/courses
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const courses = await prisma.course.findMany({
    include: {
      lessons: { orderBy: { sortOrder: 'asc' } },
      enrollments: true,
      contacts: true,
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

  const { code, section, title, description } = body as {
    code?: string;
    section?: string | null;
    title?: string;
    description?: string | null;
  };

  if (!code?.trim()) return NextResponse.json({ error: 'code is required' }, { status: 422 });
  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 422 });

  // Validate code format (e.g., CH101, CHEM-200)
  if (!/^[A-Z0-9-]+$/i.test(code)) {
    return NextResponse.json({ error: 'code must contain only letters, numbers, and hyphens' }, { status: 422 });
  }

  // Check for duplicate code+section combination
  const existing = await prisma.course.findUnique({
    where: {
      code_section: {
        code: code.trim().toUpperCase(),
        section: section?.trim() || null,
      },
    },
  });

  if (existing) {
    return NextResponse.json({ error: 'A course with this code and section already exists' }, { status: 409 });
  }

  const course = await prisma.course.create({
    data: {
      code: code.trim().toUpperCase(),
      section: section?.trim() || null,
      title: title.trim(),
      description: description?.trim() || null,
    },
    include: {
      lessons: true,
      enrollments: true,
      contacts: true,
    },
  });

  return NextResponse.json(course, { status: 201 });
}
