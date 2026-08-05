import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { validateQuestionTimestamps } from '@/app/utils/questionTimestamps';
import { getMultipleChoiceChoices, validateMultipleChoiceAnswers } from '@/app/utils/multipleChoice';
import { validateShortAnswerOptions } from '@/app/utils/shortAnswer';

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
    include: { questions: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!node) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(node);
}

// PATCH /api/instructor/nodes/[nodeId] — replace questions entirely (delete + recreate)
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

  const { title, summary, videoUrl, questions } = body as {
    title?: string;
    summary?: string;
    videoUrl?: string | null;
    questions?: Array<{
      sortOrder: number;
      prompt: string;
      options: unknown;
      correctIndices?: unknown;
      isPreLecture?: boolean;
      timeOffsetSeconds?: number | null;
    }>;
  };

  const timestampError = questions ? validateQuestionTimestamps(questions) : null;
  if (timestampError) {
    return NextResponse.json({ error: timestampError }, { status: 422 });
  }

  const correctAnswersError = questions ? validateMultipleChoiceAnswers(questions) : null;
  if (correctAnswersError) {
    return NextResponse.json({ error: correctAnswersError }, { status: 422 });
  }

  const shortAnswerError = questions ? validateShortAnswerOptions(questions) : null;
  if (shortAnswerError) {
    return NextResponse.json({ error: shortAnswerError }, { status: 422 });
  }

  const node = await prisma.$transaction(async (tx) => {
    // Replace all questions
    if (questions !== undefined) {
      await tx.nodeQuestion.deleteMany({ where: { nodeId } });
    }

    return tx.node.update({
      where: { id: nodeId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(summary !== undefined && { summary: summary.trim() || null }),
        ...(videoUrl !== undefined && { videoUrl: videoUrl || null }),
        ...(questions !== undefined && {
          questions: {
            create: questions.map((q) => ({
              sortOrder: q.sortOrder,
              prompt: q.prompt,
              options: q.options as object,
              correctIndices: getMultipleChoiceChoices(q.options) ? (q.correctIndices as number[]) : [],
              isPreLecture: q.isPreLecture ?? false,
              timeOffsetSeconds: q.isPreLecture ? null : (q.timeOffsetSeconds ?? null),
            })),
          },
        }),
      },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
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
    // Remove every lesson-instance of this node. LessonNodeEdge rows linked to those
    // instances are automatically removed via cascade on source/target.
    await tx.lessonNode.deleteMany({ where: { nodeId } });

    // Delete the master node after all lesson references are gone.
    await tx.node.delete({ where: { id: nodeId } });
  });

  return new NextResponse(null, { status: 204 });
}
