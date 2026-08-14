import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ courseId: string; enrollmentId: string }>;
}

// DELETE /api/instructor/courses/[courseId]/enrollments/[enrollmentId]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId, enrollmentId } = await params;

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      OR: [{ createdByClerkId: userId }, { createdByClerkId: null }],
    },
  });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
  });

  if (!enrollment || enrollment.courseId !== courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.enrollment.delete({ where: { id: enrollmentId } });
  return new NextResponse(null, { status: 204 });
}
