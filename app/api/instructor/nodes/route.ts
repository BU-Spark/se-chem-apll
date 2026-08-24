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

// GET /api/instructor/nodes — list all nodes
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const nodes = await prisma.node.findMany({
    where: {
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
    select: {
      id: true,
      title: true,
      summary: true,
      videoUrl: true,
      isDraft: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { lessonNodes: true, checkpoints: true, quizQuestions: true } },
    },
    orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }],
  });
  return NextResponse.json(nodes);
}

function rejectIfNotArray(value: unknown, field: string): NextResponse | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) {
    return NextResponse.json({ error: `${field} must be an array` }, { status: 422 });
  }
  return null;
}

// POST /api/instructor/nodes — create a new node with checkpoints + quiz bank
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    title,
    summary,
    videoUrl,
    learningObjectives,
    checkpoints,
    quizQuestions,
    isDraft = false,
  } = body as {
    title?: string;
    summary?: string;
    videoUrl?: string | null;
    learningObjectives?: string[];
    checkpoints?: CheckpointPayload[];
    quizQuestions?: QuestionPayload[];
    isDraft?: boolean;
  };

  if (typeof isDraft !== 'boolean') {
    return NextResponse.json({ error: 'isDraft must be a boolean' }, { status: 422 });
  }

  if (!isDraft && !title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 422 });
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

  if (!isDraft) {
    const contentError = validateNodeContent({ checkpoints, quizQuestions });
    if (contentError) {
      return NextResponse.json({ error: contentError }, { status: 422 });
    }

    if (!parseYouTubeId((videoUrl ?? '').trim())) {
      return NextResponse.json({ error: 'A valid YouTube video URL is required.' }, { status: 422 });
    }
    if (!quizQuestions || quizQuestions.length === 0) {
      return NextResponse.json({ error: 'At least one quiz bank question is required.' }, { status: 422 });
    }
  }

  const normalizedObjectives = (learningObjectives ?? []).map((item) => item.trim()).filter((item) => item.length > 0);

  const node = await prisma.node.create({
    data: {
      title: title?.trim() ?? '',
      summary: summary?.trim() ?? null,
      videoUrl: videoUrl?.trim() || null,
      learningObjectives: normalizedObjectives,
      createdByClerkId: userId,
      isDraft,
      checkpoints: {
        create: (checkpoints ?? []).map(serializeCheckpointCreate),
      },
      quizQuestions: {
        create: (quizQuestions ?? []).map(serializeQuestionCreate),
      },
    },
    include: nodeInclude,
  });

  return NextResponse.json(node, { status: 201 });
}
