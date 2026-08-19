import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { isValidPassingPercent } from '@/app/utils/passingPercent';
import { isValidQuizQuestionCount } from '@/app/utils/quizQuestionCount';

// GET /api/instructor/lessons
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lessons = await prisma.lesson.findMany({
    where: {
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: {
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

  const { title, slug, summary, description, estimatedMinutes, lessonNodes } = body as {
    title?: string;
    slug?: string;
    summary?: string;
    description?: string | null;
    estimatedMinutes?: number | null;
    lessonNodes?: Array<{
      nodeId: string;
      sortOrder: number;
      passingPercent?: number;
      quizQuestionCount?: number;
      isRequired?: boolean;
    }>;
  };

  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 422 });
  if (!slug?.trim()) return NextResponse.json({ error: 'slug is required' }, { status: 422 });
  if (!summary?.trim()) return NextResponse.json({ error: 'summary is required' }, { status: 422 });

  if ((lessonNodes ?? []).some((ln) => !isValidPassingPercent(ln.passingPercent))) {
    return NextResponse.json(
      { error: 'Each lesson node must have a passingPercent between 0 and 100' },
      { status: 422 }
    );
  }

  // same check as above, but for quizQuestionCount
  if ((lessonNodes ?? []).some((ln) => !isValidQuizQuestionCount(ln.quizQuestionCount))) {
    return NextResponse.json(
      { error: 'Each lesson node must have a non-negative integer quizQuestionCount' },
      { status: 422 }
    );
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'slug must be lowercase letters, numbers, and hyphens only' }, { status: 422 });
  }

  const lesson = await prisma.lesson.create({
    data: {
      title: title.trim(),
      slug: slug.trim(),
      summary: summary.trim(),
      createdByClerkId: userId,
      description: description ?? null,
      estimatedMinutes: estimatedMinutes ?? null,
      lessonNodes: {
        create: (lessonNodes ?? []).map((ln) => ({
          nodeId: ln.nodeId,
          sortOrder: ln.sortOrder,
          passingPercent: ln.passingPercent!,
          quizQuestionCount: ln.quizQuestionCount!,
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
