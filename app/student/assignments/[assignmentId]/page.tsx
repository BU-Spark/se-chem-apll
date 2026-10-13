import { notFound } from 'next/navigation';
import { requireStudent } from '@/lib/auth/server';
import { assignmentView, SubmissionError } from '@/lib/submissions/service';
import AssignmentWork from './AssignmentWork';
export const dynamic = 'force-dynamic';
export default async function AssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const student = await requireStudent();
  try {
    const view = await assignmentView(student.id, (await params).assignmentId);
    return <AssignmentWork initial={JSON.parse(JSON.stringify(view))} />;
  } catch (e) {
    if (e instanceof SubmissionError && e.status === 404) notFound();
    if (e instanceof SubmissionError) return <p>{e.message}</p>;
    throw e;
  }
}
