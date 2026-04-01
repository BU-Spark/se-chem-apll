import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ lessonId: string }>;
}

// GET /api/instructor/lessons/[lessonId]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lessonId } = await params;
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      course: true,
      lessonNodes: {
        include: { node: { include: { questions: { orderBy: { sortOrder: 'asc' } } } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(lesson);
}

// PATCH /api/instructor/lessons/[lessonId] — update metadata and/or replace lessonNodes
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lessonId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, slug, summary, description, estimatedMinutes, dueDate, lessonNodes } = body as {
    title?: string;
    slug?: string;
    summary?: string;
    description?: string | null;
    estimatedMinutes?: number | null;
    dueDate?: string | null;
    lessonNodes?: Array<{
      nodeId: string;
      sortOrder: number;
      passingPercentOverride?: number | null;
      isRequired?: boolean;
    }>;
  };

  const lesson = await prisma.$transaction(async (tx) => {
    if (lessonNodes !== undefined) {
      await tx.lessonNode.deleteMany({ where: { lessonId } });
    }

    return tx.lesson.update({
      where: { id: lessonId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(slug !== undefined && { slug: slug.trim() }),
        ...(summary !== undefined && { summary: summary.trim() }),
        ...(description !== undefined && { description: description ?? null }),
        ...(estimatedMinutes !== undefined && { estimatedMinutes: estimatedMinutes ?? null }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(lessonNodes !== undefined && {
          lessonNodes: {
            create: lessonNodes.map((ln) => ({
              nodeId: ln.nodeId,
              sortOrder: ln.sortOrder,
              passingPercentOverride: ln.passingPercentOverride ?? null,
              isRequired: ln.isRequired ?? true,
            })),
          },
        }),
      },
      include: {
        lessonNodes: { include: { node: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
  });

  return NextResponse.json(lesson);
}

// DELETE /api/instructor/lessons/[lessonId]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lessonId } = await params;
  await prisma.lesson.delete({ where: { id: lessonId } });
  return new NextResponse(null, { status: 204 });
}
