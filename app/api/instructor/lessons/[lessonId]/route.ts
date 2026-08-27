import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { isAcyclic } from '@/app/utils/dagValidation';
import { isValidPassingPercent } from '@/app/utils/passingPercent';
import { isValidQuizQuestionCount } from '@/app/utils/quizQuestionCount';
import { nodeInclude } from '@/app/utils/nodeContent';

interface RouteContext {
  params: Promise<{ lessonId: string }>;
}

// GET /api/instructor/lessons/[lessonId]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lessonId } = await params;
  const lesson = await prisma.lesson.findFirst({
    where: {
      id: lessonId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: {
      lessonNodes: {
        include: { node: { include: nodeInclude } },
        orderBy: { sortOrder: 'asc' },
      },
      lessonNodeEdges: {
        select: { id: true, sourceId: true, targetId: true },
        orderBy: { createdAt: 'asc' },
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

  const { title, slug, summary, description, estimatedMinutes, lessonNodes, edges, isDraft } = body as {
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
    edges?: Array<{ sourceSortOrder: number; targetSortOrder: number }>;
    isDraft?: boolean;
  };

  const owned = await prisma.lesson.findFirst({
    where: {
      id: lessonId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: { lessonNodes: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (isDraft !== undefined && typeof isDraft !== 'boolean') {
    return NextResponse.json({ error: 'isDraft must be a boolean' }, { status: 422 });
  }
  if (lessonNodes !== undefined && !Array.isArray(lessonNodes)) {
    return NextResponse.json({ error: 'lessonNodes must be an array' }, { status: 422 });
  }
  if (edges !== undefined && !Array.isArray(edges)) {
    return NextResponse.json({ error: 'edges must be an array' }, { status: 422 });
  }

  const savingAsDraft = isDraft ?? owned.isDraft;
  const effectiveLessonNodes = lessonNodes ?? owned.lessonNodes;

  if (!savingAsDraft) {
    if (!(title ?? owned.title).trim()) return NextResponse.json({ error: 'title is required' }, { status: 422 });
    const effectiveSlug = slug === undefined ? owned.slug : slug;
    if (!effectiveSlug?.trim()) return NextResponse.json({ error: 'slug is required' }, { status: 422 });
    if (!(summary ?? owned.summary).trim()) return NextResponse.json({ error: 'summary is required' }, { status: 422 });
    if (effectiveLessonNodes.length === 0) {
      return NextResponse.json({ error: 'At least one node is required.' }, { status: 422 });
    }
    if (!/^[a-z0-9-]+$/.test(effectiveSlug)) {
      return NextResponse.json({ error: 'slug must be lowercase letters, numbers, and hyphens only' }, { status: 422 });
    }
  }

  if (!savingAsDraft && effectiveLessonNodes.some((ln) => !isValidPassingPercent(ln.passingPercent))) {
    return NextResponse.json(
      { error: 'Each lesson node must have a passingPercent between 0 and 100' },
      { status: 422 }
    );
  }

  if (!savingAsDraft && effectiveLessonNodes.some((ln) => !isValidQuizQuestionCount(ln.quizQuestionCount))) {
    return NextResponse.json(
      { error: 'Each lesson node must have a non-negative integer quizQuestionCount' },
      { status: 422 }
    );
  }

  // Server-side DAG validation before touching the DB
  if (edges && edges.length > 0) {
    const edgesForValidation = edges.map((e) => ({
      sourceId: String(e.sourceSortOrder),
      targetId: String(e.targetSortOrder),
    }));
    if (!isAcyclic(edgesForValidation)) {
      return NextResponse.json({ error: 'Edge set contains a cycle' }, { status: 422 });
    }
  }

  if (lessonNodes && lessonNodes.length > 0) {
    const nodeIds = [...new Set(lessonNodes.map((ln) => ln.nodeId))];
    const draftNode = await prisma.node.findFirst({
      where: { id: { in: nodeIds }, isDraft: true },
      select: { id: true },
    });
    if (draftNode) {
      return NextResponse.json({ error: 'Draft nodes cannot be added to a lesson.' }, { status: 422 });
    }
  }

  // Use nested write instead of $transaction — pgBouncer (transaction pooling mode)
  // doesn't support Prisma's interactive transaction callback form reliably.
  // deleteMany + create on the nested relation is atomic at the Prisma level;
  // cascade deletes on LessonNodeEdge handle edge cleanup automatically.
  const updated = await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(slug !== undefined && { slug: slug.trim() || null }),
      ...(summary !== undefined && { summary: summary.trim() }),
      ...(description !== undefined && { description: description ?? null }),
      ...(estimatedMinutes !== undefined && { estimatedMinutes: estimatedMinutes ?? null }),
      ...(isDraft !== undefined && { isDraft }),
      ...(lessonNodes !== undefined && {
        lessonNodes: {
          deleteMany: {},
          create: lessonNodes.map((ln) => ({
            nodeId: ln.nodeId,
            sortOrder: ln.sortOrder,
            passingPercent: ln.passingPercent ?? 0,
            quizQuestionCount: ln.quizQuestionCount ?? 0,
            isRequired: ln.isRequired ?? true,
          })),
        },
      }),
    },
    include: {
      lessonNodes: { include: { node: true }, orderBy: { sortOrder: 'asc' } },
    },
  });

  if (edges && edges.length > 0) {
    const sortToId = new Map(updated.lessonNodes.map((ln) => [ln.sortOrder, ln.id]));
    const edgeRows = edges
      .map(({ sourceSortOrder, targetSortOrder }) => ({
        lessonId,
        sourceId: sortToId.get(sourceSortOrder)!,
        targetId: sortToId.get(targetSortOrder)!,
      }))
      .filter((e) => e.sourceId && e.targetId);

    if (edgeRows.length > 0) {
      await prisma.lessonNodeEdge.createMany({ data: edgeRows });
    }
  }

  const fullLesson = await prisma.lesson.findUnique({
    where: { id: updated.id },
    include: {
      lessonNodes: { include: { node: true }, orderBy: { sortOrder: 'asc' } },
      lessonNodeEdges: {
        select: { id: true, sourceId: true, targetId: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return NextResponse.json(fullLesson);
}

// DELETE /api/instructor/lessons/[lessonId]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lessonId } = await params;

  const owned = await prisma.lesson.findFirst({
    where: {
      id: lessonId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.lesson.delete({ where: { id: lessonId } });
  return new NextResponse(null, { status: 204 });
}
