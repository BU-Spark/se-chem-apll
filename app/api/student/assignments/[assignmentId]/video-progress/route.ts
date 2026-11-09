import { NextResponse } from 'next/server';
import { apiAccess } from '@/lib/auth/api';
import { prisma } from '@/lib/prisma';
import { asStudent } from '@/lib/studentCourses';

type Context = { params: Promise<{ assignmentId: string }> };

// Longer than any lesson video; guards against nonsense values.
const MAX_POSITION_SECONDS = 24 * 60 * 60;

/**
 * Saves where the student is in a node's video, so leaving and coming back resumes there.
 * `watched: true` also records that a video without questions was watched to the end (it has no
 * attempt to show that). Saving again updates the same row.
 */
export async function POST(request: Request, { params }: Context) {
  const { user: student, error } = await apiAccess('student');
  if (error) return error;

  const body = await request.json().catch(() => null);
  const position = body?.positionSeconds;
  if (
    typeof body?.nodeId !== 'string' ||
    typeof position !== 'number' ||
    !(position >= 0 && position <= MAX_POSITION_SECONDS) ||
    (body.watched !== undefined && typeof body.watched !== 'boolean')
  ) {
    return NextResponse.json({ error: 'nodeId and a valid positionSeconds are required.' }, { status: 400 });
  }

  const courseLessonId = (await params).assignmentId;
  // A published node of this lesson, in a course the student is enrolled in.
  const lessonNode = await prisma.lessonNode.findFirst({
    where: {
      id: body.nodeId,
      node: { isDraft: false },
      lesson: {
        isDraft: false,
        courseLessons: { some: { id: courseLessonId, course: { enrollments: { some: asStudent(student.id) } } } },
      },
    },
    select: { id: true },
  });
  if (!lessonNode) return NextResponse.json({ error: 'Node not found.' }, { status: 404 });

  const key = { studentId: student.id, courseLessonId, lessonNodeId: lessonNode.id };
  const watched = body.watched ? { watchedAt: new Date() } : {};
  await prisma.nodeVideoProgress.upsert({
    where: { studentId_courseLessonId_lessonNodeId: key },
    create: { ...key, positionSeconds: position, ...watched },
    update: { positionSeconds: position, ...watched },
  });
  return NextResponse.json({ ok: true });
}
