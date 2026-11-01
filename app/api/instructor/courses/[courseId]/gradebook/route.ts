import { apiAccess, contentScope } from '@/lib/auth/api';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export async function GET(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;
  const { courseId } = await params;
  const search = new URL(request.url).searchParams;
  const studentId = search.get('studentId');
  const assignmentId = search.get('assignmentId');
  if (!studentId || !assignmentId)
    return NextResponse.json({ error: 'Student and assignment are required.' }, { status: 400 });
  const assignment = await prisma.courseLesson.findFirst({
    where: {
      id: assignmentId,
      courseId,
      course: {
        ...contentScope(user),
        enrollments: { some: { studentId, role: 'STUDENT' } },
      },
    },
    select: { id: true },
  });
  if (!assignment) return NextResponse.json({ error: 'Results not found.' }, { status: 404 });
  const progress = await prisma.courseLessonProgress.findUnique({
    where: { studentId_courseLessonId: { studentId, courseLessonId: assignmentId } },
    select: { id: true, status: true, percentComplete: true, startedAt: true, completedAt: true },
  });
  const headers = { 'Cache-Control': 'private, no-store' };
  const attemptId = search.get('attemptId');
  if (attemptId) {
    const attempt = progress
      ? await prisma.nodeAttempt.findFirst({
          where: { id: attemptId, progressId: progress.id },
          select: {
            id: true,
            responses: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                selectedIndices: true,
                rawAnswer: true,
                isCorrect: true,
                createdAt: true,
                snapshot: true,
              },
            },
          },
        })
      : null;
    if (!attempt) return NextResponse.json({ error: 'Attempt not found.' }, { status: 404 });
    return NextResponse.json(attempt, { headers });
  }
  if (!progress)
    return NextResponse.json(
      { progress: null, bestId: null, submissions: [], attempts: [], nextCursor: null },
      { headers }
    );
  const cursor = search.get('cursor');
  if (
    cursor &&
    !(await prisma.lessonSubmission.findFirst({ where: { id: cursor, progressId: progress.id }, select: { id: true } }))
  )
    return NextResponse.json({ error: 'Invalid cursor.' }, { status: 400 });
  const [best, submissions, attempts] = await Promise.all([
    prisma.lessonSubmission.findFirst({
      where: { progressId: progress.id },
      orderBy: [{ finalPercent: { sort: 'desc', nulls: 'last' } }, { submittedAt: 'asc' }, { number: 'asc' }],
      select: { id: true },
    }),
    prisma.lessonSubmission.findMany({
      where: { progressId: progress.id },
      orderBy: { number: 'desc' },
      take: 26,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.nodeAttempt.findMany({
      where: { progressId: progress.id },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 25,
      select: {
        id: true,
        kind: true,
        score: true,
        isPassing: true,
        startedAt: true,
        completedAt: true,
        snapshot: true,
      },
    }),
  ]);
  // Exclude grading keys from the overview payload; individual response snapshots load on demand.
  return NextResponse.json(
    {
      progress,
      bestId: best?.id ?? null,
      submissions: submissions.slice(0, 25),
      nextCursor: submissions.length > 25 ? submissions[24].id : null,
      attempts: attempts.map((a) => ({
        ...a,
        snapshot: { nodeTitle: (a.snapshot as { nodeTitle: string }).nodeTitle },
      })),
    },
    { headers }
  );
}
