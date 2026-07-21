import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

// GET /api/instructor/nodes — list all nodes
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const nodes = await prisma.node.findMany({
    include: {
      questions: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { lessonNodes: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(nodes);
}

// POST /api/instructor/nodes — create a new node with questions
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      correctIndex?: number | null;
      isPreLecture?: boolean;
    }>;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 422 });
  }

  const node = await prisma.node.create({
    data: {
      title: title.trim(),
      summary: summary?.trim() ?? null,
      videoUrl: videoUrl ?? null,
      questions: {
        create: (questions ?? []).map((q) => ({
          sortOrder: q.sortOrder,
          prompt: q.prompt,
          options: q.options as object,
          correctIndex: q.correctIndex ?? null,
          isPreLecture: q.isPreLecture ?? false,
        })),
      },
    },
    include: { questions: { orderBy: { sortOrder: 'asc' } } },
  });

  return NextResponse.json(node, { status: 201 });
}
