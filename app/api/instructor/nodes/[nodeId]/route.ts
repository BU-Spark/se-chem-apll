import { saveCheckpoints, CheckpointSaveConflict } from '@/app/utils/saveCheckpoints';
import { NextRequest, NextResponse } from 'next/server';
import { apiAccess, contentScope } from '@/lib/auth/api';
import { prisma } from '@/lib/prisma';
import { parseYouTubeId } from '@/app/utils/youtube';
import {
  nodeInclude,
  questionContentKey,
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
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  const { nodeId } = await params;
  const node = await prisma.node.findFirst({
    where: {
      id: nodeId,
      ...contentScope(user),
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
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  const { nodeId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json({ error: 'Body must be an object' }, { status: 422 });

  const { title, summary, videoUrl, tags, learningObjectives, checkpoints, quizQuestions, isDraft } = body as {
    title?: string;
    summary?: string;
    videoUrl?: string | null;
    tags?: string[];
    learningObjectives?: string[];
    checkpoints?: CheckpointPayload[];
    quizQuestions?: QuestionPayload[];
    isDraft?: boolean;
  };
  const owned = await prisma.node.findFirst({
    where: {
      id: nodeId,
      ...contentScope(user),
    },
    include: nodeInclude,
  });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (isDraft !== undefined && typeof isDraft !== 'boolean') {
    return NextResponse.json({ error: 'isDraft must be a boolean' }, { status: 422 });
  }

  for (const [field, value] of Object.entries({ title, summary, videoUrl })) {
    if (value !== undefined && !(field === 'videoUrl' && value === null) && typeof value !== 'string')
      return NextResponse.json({ error: `${field} must be text` }, { status: 422 });
  }

  const tagsTypeError = rejectIfNotArray(tags, 'tags');
  if (tagsTypeError) return tagsTypeError;
  const learningObjectivesTypeError = rejectIfNotArray(learningObjectives, 'learningObjectives');
  if (learningObjectivesTypeError) return learningObjectivesTypeError;
  const checkpointsTypeError = rejectIfNotArray(checkpoints, 'checkpoints');
  if (checkpointsTypeError) return checkpointsTypeError;
  const quizQuestionsTypeError = rejectIfNotArray(quizQuestions, 'quizQuestions');
  if (quizQuestionsTypeError) return quizQuestionsTypeError;

  if (tags !== undefined && tags.some((item) => typeof item !== 'string')) {
    return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 422 });
  }
  if (learningObjectives !== undefined && learningObjectives.some((item) => typeof item !== 'string')) {
    return NextResponse.json({ error: 'learningObjectives must be an array of strings' }, { status: 422 });
  }

  const replacingCheckpoints = checkpoints !== undefined;

  const savingAsDraft = isDraft ?? owned.isDraft;
  {
    const effectiveCheckpoints = checkpoints ?? owned.checkpoints;
    const effectiveQuizQuestions = quizQuestions ?? owned.quizQuestions;
    const contentError = validateNodeContent(
      {
        checkpoints: effectiveCheckpoints,
        quizQuestions: effectiveQuizQuestions,
      },
      savingAsDraft ? 'draft' : 'publish'
    );
    if (contentError) {
      return NextResponse.json({ error: contentError }, { status: 422 });
    }
  }
  if (!savingAsDraft) {
    if (!(title ?? owned.title).trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 422 });
    }
    const effectiveVideoUrl = videoUrl === undefined ? owned.videoUrl : videoUrl;
    if (!parseYouTubeId((effectiveVideoUrl ?? '').trim())) {
      return NextResponse.json({ error: 'A valid YouTube video URL is required.' }, { status: 422 });
    }
    if ((quizQuestions ?? owned.quizQuestions).length === 0) {
      return NextResponse.json({ error: 'At least one quiz bank question is required.' }, { status: 422 });
    }
  }

  const quizContent = (questions: QuestionPayload[]) =>
    JSON.stringify(questions.map((q) => [q.sortOrder, questionContentKey(q)]));
  const replacingQuizQuestions =
    quizQuestions !== undefined && quizContent(quizQuestions) !== quizContent(owned.quizQuestions);

  let node;
  try {
    node = await prisma.$transaction(async (tx) => {
      if (replacingCheckpoints) await saveCheckpoints(tx, nodeId, checkpoints!);

      if (replacingQuizQuestions) {
        await tx.quizQuestion.deleteMany({ where: { nodeId } });
      }

      const normalizedTags =
        tags === undefined ? undefined : tags.map((item) => item.trim()).filter((item) => item.length > 0);
      const normalizedLearningObjectives =
        learningObjectives === undefined
          ? undefined
          : learningObjectives.map((item) => item.trim()).filter((item) => item.length > 0);

      return tx.node.update({
        where: { id: nodeId },
        data: {
          ...(title !== undefined && { title: title.trim() }),
          ...(summary !== undefined && { summary: summary.trim() || null }),
          ...(videoUrl !== undefined && { videoUrl: (videoUrl ?? '').trim() || null }),
          ...(normalizedTags !== undefined && { tags: normalizedTags }),
          ...(normalizedLearningObjectives !== undefined && { learningObjectives: normalizedLearningObjectives }),
          ...(isDraft !== undefined && { isDraft }),
          ...(replacingQuizQuestions && {
            quizQuestions: {
              create: quizQuestions!.map(serializeQuestionCreate),
            },
          }),
        },
        include: nodeInclude,
      });
    });
  } catch (error) {
    if (error instanceof CheckpointSaveConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json(node);
}

// DELETE /api/instructor/nodes/[nodeId]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  const { nodeId } = await params;
  const existing = await prisma.node.findFirst({
    where: {
      id: nodeId,
      ...contentScope(user),
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
