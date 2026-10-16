import { prisma } from '@/lib/prisma';

const asStudent = (studentId: string) => ({ studentId, role: 'STUDENT' as const });

// Courses the student is enrolled in as a student, oldest enrollment first.
export async function getEnrolledCourses(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: asStudent(studentId),
    select: { course: { select: { id: true, title: true, description: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return enrollments.map((enrollment) => enrollment.course);
}

// Instructor contacts across the student's courses, listing each instructor once.
export async function getStudentInstructors(studentId: string) {
  const contacts = await prisma.courseContact.findMany({
    where: { type: 'INSTRUCTOR', course: { enrollments: { some: asStudent(studentId) } } },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  const seenEmails = new Set<string>();
  return contacts.filter((contact) => !seenEmails.has(contact.email) && seenEmails.add(contact.email));
}
