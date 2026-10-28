import { referencedContentAllowed } from '@/lib/auth/content';
import { NextRequest, NextResponse } from 'next/server';
import { apiAccess, contentScope } from '@/lib/auth/api';
import { prisma } from '@/lib/prisma';
import { lessonPolicyData, validateLessonPolicy, type LessonPolicyInput } from '@/app/utils/lessonSubmissionPolicy';

// GET /api/instructor/courses
export async function GET() {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  const courses = await prisma.course.findMany({
    where: {
      ...contentScope(user),
    },
    include: {
      enrollments: true,
      contacts: true,
      courseLessons: {
        include: { lesson: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(courses);
}

// POST /api/instructor/courses
export async function POST(req: NextRequest) {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code, section, title, description, lessons } = body as {
    code?: string;
    section?: string | null;
    title?: string;
    description?: string | null;
    lessons?: Array<
      LessonPolicyInput & {
        lessonId: string;
        sortOrder: number;
      }
    >;
  };

  if (!code?.trim()) return NextResponse.json({ error: 'code is required' }, { status: 422 });
  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 422 });

  // Validate code format (e.g., CH101, CHEM-200)
  if (!/^[A-Z0-9-]+$/i.test(code)) {
    return NextResponse.json({ error: 'code must contain only letters, numbers, and hyphens' }, { status: 422 });
  }

  // Check for duplicate code+section combination
  const existing = await prisma.course.findFirst({
    where: {
      code: code.trim().toUpperCase(),
      section: section?.trim() || null,
    },
  });

  if (existing) {
    return NextResponse.json({ error: 'A course with this code and section already exists' }, { status: 409 });
  }

  const lessonInputs = lessons ?? [];

  for (const row of lessonInputs) {
    if (!row.lessonId) {
      return NextResponse.json({ error: 'Each imported lesson needs a lessonId' }, { status: 422 });
    }
    const policyError = validateLessonPolicy(row);
    if (policyError) return NextResponse.json({ error: policyError }, { status: 422 });
  }

  const lessonIds = [...new Set(lessonInputs.map((row) => row.lessonId))];
  if (lessonIds.length > 0) {
    if (!(await referencedContentAllowed('lesson', lessonIds, user)))
      return NextResponse.json({ error: 'Referenced lessons are unavailable.' }, { status: 403 });

    const draftLesson = await prisma.lesson.findFirst({
      where: { id: { in: lessonIds }, isDraft: true },
      select: { id: true },
    });
    if (draftLesson) {
      return NextResponse.json({ error: 'Draft lessons cannot be added to a course.' }, { status: 422 });
    }
  }

  const course = await prisma.course.create({
    data: {
      code: code.trim().toUpperCase(),
      section: section?.trim() || null,
      title: title.trim(),
      createdByClerkId: user.clerkUserId,
      description: description?.trim() || null,
      courseLessons: {
        create: lessonInputs.map((row) => ({
          lessonId: row.lessonId,
          ...lessonPolicyData(row),
          sortOrder: row.sortOrder,
        })),
      },
    },
    include: {
      courseLessons: {
        include: { lesson: true },
        orderBy: { sortOrder: 'asc' },
      },
      enrollments: true,
      contacts: true,
    },
  });

  return NextResponse.json(course, { status: 201 });
}
