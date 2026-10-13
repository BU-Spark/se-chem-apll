import { NextRequest, NextResponse } from 'next/server';
import { apiAccess, contentScope } from '@/lib/auth/api';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ courseId: string; enrollmentId: string }>;
}

// DELETE /api/instructor/courses/[courseId]/enrollments/[enrollmentId]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { user, error } = await apiAccess('instructor');
  if (error) return error;

  const { courseId, enrollmentId } = await params;

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      ...contentScope(user),
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
