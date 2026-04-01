import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

// GET /api/instructor/lessons
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lessons = await prisma.lesson.findMany({
    include: {
      course: true,
      lessonNodes: {
        include: { node: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(lessons);
}

// POST /api/instructor/lessons
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, slug, summary, description, courseId, estimatedMinutes, dueDate, lessonNodes } = body as {
    title?: string;
    slug?: string;
    summary?: string;
    description?: string | null;
    courseId?: string;
    estimatedMinutes?: number | null;
    dueDate?: string | null;
    lessonNodes?: Array<{
      nodeId: string;
      sortOrder: number;
      passingPercentOverride?: number | null;
      isRequired?: boolean;
    }>;
  };

  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 422 });
  if (!slug?.trim()) return NextResponse.json({ error: 'slug is required' }, { status: 422 });
  if (!summary?.trim()) return NextResponse.json({ error: 'summary is required' }, { status: 422 });
  if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 422 });

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'slug must be lowercase letters, numbers, and hyphens only' }, { status: 422 });
  }

  const lesson = await prisma.lesson.create({
    data: {
      title: title.trim(),
      slug: slug.trim(),
      summary: summary.trim(),
      description: description ?? null,
      courseId,
      estimatedMinutes: estimatedMinutes ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      lessonNodes: {
        create: (lessonNodes ?? []).map((ln) => ({
          nodeId: ln.nodeId,
          sortOrder: ln.sortOrder,
          passingPercentOverride: ln.passingPercentOverride ?? null,
          isRequired: ln.isRequired ?? true,
        })),
      },
    },
    include: {
      lessonNodes: { include: { node: true }, orderBy: { sortOrder: 'asc' } },
    },
  });

  return NextResponse.json(lesson, { status: 201 });
}
