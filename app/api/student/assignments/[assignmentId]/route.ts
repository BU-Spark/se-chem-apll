import { NextResponse } from 'next/server';
import { signedInStudent } from '@/lib/submissions/student';
import { assignmentView, startAttempt, finishAttempt, submitLesson, SubmissionError } from '@/lib/submissions/service';
type Context = { params: Promise<{ assignmentId: string }> };
export async function GET(_request: Request, { params }: Context) {
  const student = await signedInStudent();
  if (!student) return NextResponse.json({ error: 'Student access required.' }, { status: 403 });
  try {
    return NextResponse.json(await assignmentView(student.id, (await params).assignmentId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  if (e instanceof SubmissionError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('Assignment request failed', e);
  return NextResponse.json({ error: 'Unable to save this request. Please retry.' }, { status: 500 });
}
export async function POST(request: Request, { params }: Context) {
  const student = await signedInStudent();
  if (!student) return NextResponse.json({ error: 'Student access required.' }, { status: 403 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { assignmentId } = await params;
  try {
    if (
      body.action === 'finish' &&
      typeof body.attemptId === 'string' &&
      Array.isArray(body.answers) &&
      body.answers.length <= 1000 &&
      body.answers.every(
        (a: unknown) => a && typeof a === 'object' && 'questionId' in a && typeof a.questionId === 'string'
      )
    )
      return NextResponse.json(await finishAttempt(student.id, assignmentId, body.attemptId, body.answers));
    if (typeof body.key !== 'string' || body.key.length < 8 || body.key.length > 100)
      throw new SubmissionError('A valid request key is required.', 400);
    if (
      body.action === 'start' &&
      typeof body.nodeId === 'string' &&
      ['QUIZ', 'CHECKPOINT', 'REVIEW'].includes(body.kind)
    )
      return NextResponse.json(await startAttempt(student.id, assignmentId, body.nodeId, body.kind, body.key));
    if (body.action === 'submit') return NextResponse.json(await submitLesson(student.id, assignmentId, body.key));
    throw new SubmissionError('Invalid action.', 400);
  } catch (e) {
    return failure(e);
  }
}
