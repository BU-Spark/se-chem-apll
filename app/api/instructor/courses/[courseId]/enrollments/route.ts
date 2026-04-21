import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

// GET /api/instructor/courses/[courseId]/enrollments
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId } = await params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    include: { student: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(enrollments);
}

// POST /api/instructor/courses/[courseId]/enrollments
// Body: { email: string }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId } = await params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email } = body as { email?: string };
  if (!email || !email.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Find or create the student record
  let student = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!student) {
    student = await prisma.user.create({
      data: { email: normalizedEmail },
    });
  }

  // Check if already enrolled
  const existing = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId: student.id, courseId } },
  });
  if (existing) {
    return NextResponse.json({ error: 'This student is already enrolled in the course' }, { status: 409 });
  }

  const enrollment = await prisma.enrollment.create({
    data: { studentId: student.id, courseId, role: 'STUDENT' },
    include: { student: true },
  });

  return NextResponse.json(enrollment, { status: 201 });
}

// DELETE /api/instructor/courses/[courseId]/enrollments
// Body: { studentId: string }
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { studentId } = body as { studentId?: string };
  if (!studentId) {
    return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
  });
  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }

  await prisma.enrollment.delete({
    where: { studentId_courseId: { studentId, courseId } },
  });

  return new NextResponse(null, { status: 204 });
}
