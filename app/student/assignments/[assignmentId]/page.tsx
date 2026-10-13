import { notFound, redirect } from 'next/navigation';
import { signedInStudent } from '@/lib/submissions/student';
import { assignmentView, SubmissionError } from '@/lib/submissions/service';
import AssignmentWork from './AssignmentWork';
export const dynamic = 'force-dynamic';
export default async function AssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const student = await signedInStudent();
  if (!student) redirect('/student');
  try {
    const view = await assignmentView(student.id, (await params).assignmentId);
    return <AssignmentWork initial={JSON.parse(JSON.stringify(view))} />;
  } catch (e) {
    if (e instanceof SubmissionError && e.status === 404) notFound();
    if (e instanceof SubmissionError) return <p>{e.message}</p>;
    throw e;
  }
}
