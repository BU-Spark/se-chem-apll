import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { parseYouTubeId } from '@/app/utils/youtube';
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
  const node = await prisma.node.findFirst({
    where: {
      id: nodeId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: nodeInclude,
  });
  if (!node) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(node);
}

function rejectIfNotArray(value: unknown, field: string): NextResponse | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) {
    return NextResponse.json({ error: `${field} must be an array` }, { status: 422 });
  }
  return null;
}

// PATCH /api/instructor/nodes/[nodeId] — replace provided collections only
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

  const { title, summary, videoUrl, learningObjectives, checkpoints, quizQuestions, isDraft } = body as {
    title?: string;
    summary?: string;
    videoUrl?: string | null;
    learningObjectives?: string[];
    checkpoints?: CheckpointPayload[];
    quizQuestions?: QuestionPayload[];
    isDraft?: boolean;
  };
  const owned = await prisma.node.findFirst({
    where: {
      id: nodeId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    include: nodeInclude,
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (isDraft !== undefined && typeof isDraft !== 'boolean') {
    return NextResponse.json({ error: 'isDraft must be a boolean' }, { status: 422 });
  }

  const learningObjectivesTypeError = rejectIfNotArray(learningObjectives, 'learningObjectives');
  if (learningObjectivesTypeError) return learningObjectivesTypeError;
  const checkpointsTypeError = rejectIfNotArray(checkpoints, 'checkpoints');
  if (checkpointsTypeError) return checkpointsTypeError;
  const quizQuestionsTypeError = rejectIfNotArray(quizQuestions, 'quizQuestions');
  if (quizQuestionsTypeError) return quizQuestionsTypeError;

  if (learningObjectives !== undefined && learningObjectives.some((item) => typeof item !== 'string')) {
    return NextResponse.json({ error: 'learningObjectives must be an array of strings' }, { status: 422 });
  }

  const replacingCheckpoints = checkpoints !== undefined;
  const replacingQuizQuestions = quizQuestions !== undefined;

  const savingAsDraft = isDraft ?? owned.isDraft;
  if (!savingAsDraft) {
    const effectiveCheckpoints = checkpoints ?? owned.checkpoints;
    const effectiveQuizQuestions = quizQuestions ?? owned.quizQuestions;
    const contentError = validateNodeContent({
      checkpoints: effectiveCheckpoints,
      quizQuestions: effectiveQuizQuestions,
    });
    if (contentError) {
      return NextResponse.json({ error: contentError }, { status: 422 });
    }

    if (!(title ?? owned.title).trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 422 });
    }
    const effectiveVideoUrl = videoUrl === undefined ? owned.videoUrl : videoUrl;
    if (!parseYouTubeId((effectiveVideoUrl ?? '').trim())) {
      return NextResponse.json({ error: 'A valid YouTube video URL is required.' }, { status: 422 });
    }
    if (effectiveQuizQuestions.length === 0) {
      return NextResponse.json({ error: 'At least one quiz bank question is required.' }, { status: 422 });
    }
  }

  const node = await prisma.$transaction(async (tx) => {
    if (replacingCheckpoints) {
      const existingCheckpoints = await tx.nodeCheckpoint.findMany({
        where: { nodeId },
        select: { id: true, questions: { select: { id: true } } },
      });
      const checkpointQuestionIds = existingCheckpoints.flatMap((c) => c.questions.map((q) => q.id));
      if (checkpointQuestionIds.length > 0) {
        await tx.nodeResponse.deleteMany({
          where: { checkpointQuestionId: { in: checkpointQuestionIds } },
        });
      }
      await tx.nodeCheckpoint.deleteMany({ where: { nodeId } });
    }

    if (replacingQuizQuestions) {
      const quizQuestionIds = (await tx.quizQuestion.findMany({ where: { nodeId }, select: { id: true } })).map(
        (q) => q.id
      );
      if (quizQuestionIds.length > 0) {
        await tx.nodeResponse.deleteMany({
          where: { quizQuestionId: { in: quizQuestionIds } },
        });
      }
      await tx.quizQuestion.deleteMany({ where: { nodeId } });
    }

    const normalizedObjectives =
      learningObjectives === undefined
        ? undefined
        : learningObjectives.map((item) => item.trim()).filter((item) => item.length > 0);

    return tx.node.update({
      where: { id: nodeId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(summary !== undefined && { summary: summary.trim() || null }),
        ...(videoUrl !== undefined && { videoUrl: (videoUrl ?? '').trim() || null }),
        ...(normalizedObjectives !== undefined && { learningObjectives: normalizedObjectives }),
        ...(isDraft !== undefined && { isDraft }),
        ...(replacingCheckpoints && {
          checkpoints: {
            create: checkpoints!.map(serializeCheckpointCreate),
          },
        }),
        ...(replacingQuizQuestions && {
          quizQuestions: {
            create: quizQuestions!.map(serializeQuestionCreate),
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
  const existing = await prisma.node.findFirst({
    where: {
      id: nodeId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.lessonNode.deleteMany({ where: { nodeId } });
    await tx.node.delete({ where: { id: nodeId } });
  });

  return new NextResponse(null, { status: 204 });
}
