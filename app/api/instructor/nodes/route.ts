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
      createdAt: true,
      updatedAt: true,
      _count: { select: { lessonNodes: true, checkpoints: true, quizQuestions: true } },
    },
    orderBy: { createdAt: 'desc' },
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

  const { title, summary, videoUrl, tags, learningObjectives, checkpoints, quizQuestions } = body as {
    title?: string;
    summary?: string;
    videoUrl?: string | null;
    tags?: string[];
    learningObjectives?: string;
    checkpoints?: CheckpointPayload[];
    quizQuestions?: QuestionPayload[];
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 422 });
  }

  const tagsTypeError = rejectIfNotArray(tags, 'tags');
  if (tagsTypeError) return tagsTypeError;
  const checkpointsTypeError = rejectIfNotArray(checkpoints, 'checkpoints');
  if (checkpointsTypeError) return checkpointsTypeError;
  const quizQuestionsTypeError = rejectIfNotArray(quizQuestions, 'quizQuestions');
  if (quizQuestionsTypeError) return quizQuestionsTypeError;

  if (tags !== undefined && tags.some((item) => typeof item !== 'string')) {
    return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 422 });
  }
  if (learningObjectives !== undefined && typeof learningObjectives !== 'string') {
    return NextResponse.json({ error: 'learningObjectives must be a string' }, { status: 422 });
  }

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

  const normalizedTags = (tags ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
  const normalizedLearningObjectives = learningObjectives?.trim() || null;

  const node = await prisma.node.create({
    data: {
      title: title.trim(),
      summary: summary?.trim() ?? null,
      videoUrl: videoUrl ?? null,
      tags: normalizedTags,
      learningObjectives: normalizedLearningObjectives,
      createdByClerkId: userId,
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
