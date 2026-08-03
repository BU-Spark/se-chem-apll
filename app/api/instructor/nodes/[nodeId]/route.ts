import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import {
  nodeInclude,
  serializeCheckpointCreate,
  serializeQuestionCreate,
  validateNodeContent,
  type CheckpointPayload,
  type QuestionPayload,
} from '@/app/utils/nodeContent';

interface RouteContext {
  params: Promise<{ nodeId: string }>;
}

// GET /api/instructor/nodes/[nodeId]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { nodeId } = await params;
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: nodeInclude,
  });
  if (!node) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(node);
}

// PATCH /api/instructor/nodes/[nodeId] — replace checkpoints + quiz bank entirely
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { nodeId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, summary, videoUrl, checkpoints, quizQuestions } = body as {
    title?: string;
    summary?: string;
    videoUrl?: string | null;
    checkpoints?: CheckpointPayload[];
    quizQuestions?: QuestionPayload[];
  };

  const replacingContent = checkpoints !== undefined || quizQuestions !== undefined;
  if (replacingContent) {
    const contentError = validateNodeContent({
      checkpoints: checkpoints ?? [],
      quizQuestions: quizQuestions ?? [],
    });
    if (contentError) {
      return NextResponse.json({ error: contentError }, { status: 422 });
    }
  }

  const node = await prisma.$transaction(async (tx) => {
    if (replacingContent) {
      const existingCheckpoints = await tx.nodeCheckpoint.findMany({
        where: { nodeId },
        select: { id: true, questions: { select: { id: true } } },
      });
      const checkpointQuestionIds = existingCheckpoints.flatMap((c) => c.questions.map((q) => q.id));
      const quizQuestionIds = (await tx.quizQuestion.findMany({ where: { nodeId }, select: { id: true } })).map(
        (q) => q.id
      );

      if (checkpointQuestionIds.length > 0 || quizQuestionIds.length > 0) {
        await tx.nodeResponse.deleteMany({
          where: {
            OR: [{ checkpointQuestionId: { in: checkpointQuestionIds } }, { quizQuestionId: { in: quizQuestionIds } }],
          },
        });
      }

      await tx.nodeCheckpoint.deleteMany({ where: { nodeId } });
      await tx.quizQuestion.deleteMany({ where: { nodeId } });
    }

    return tx.node.update({
      where: { id: nodeId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(summary !== undefined && { summary: summary.trim() || null }),
        ...(videoUrl !== undefined && { videoUrl: videoUrl || null }),
        ...(replacingContent && {
          checkpoints: {
            create: (checkpoints ?? []).map(serializeCheckpointCreate),
          },
          quizQuestions: {
            create: (quizQuestions ?? []).map(serializeQuestionCreate),
          },
        }),
      },
      include: nodeInclude,
    });
  });

  return NextResponse.json(node);
}

// DELETE /api/instructor/nodes/[nodeId]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { nodeId } = await params;
  const existing = await prisma.node.findUnique({ where: { id: nodeId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.lessonNode.deleteMany({ where: { nodeId } });
    await tx.node.delete({ where: { id: nodeId } });
  });

  return new NextResponse(null, { status: 204 });
}
