import { notFound, redirect } from 'next/navigation';
import { requireStudent } from '@/lib/auth/server';
import { canOpenQuiz, getStudentNode } from '@/lib/studentNode';
import { ROUTES } from '@/app/routes';
import NodeQuiz from '@/app/components/NodeQuiz/NodeQuiz';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string; nodeId: string }>;
}

// The node's quiz after the video lesson (or, for nodes without video questions, after watching
// the video), and a regular node's retry.
export default async function StudentNodeQuizPage({ params }: PageProps) {
  const student = await requireStudent();

  const { courseId, lessonId, nodeId } = await params;
  const view = await getStudentNode(student.id, courseId, lessonId, nodeId);
  if (!view) notFound();

  const nodeHref = ROUTES.studentNode(courseId, lessonId, nodeId);
  if (!canOpenQuiz(view.screen, view.hasVideoQuestions, view.node.isFoundational)) redirect(nodeHref);

  return (
    <NodeQuiz
      courseLessonId={lessonId}
      lessonNodeId={nodeId}
      nodeTitle={view.node.title}
      lessonHref={ROUTES.studentLesson(courseId, lessonId)}
      doneHref={nodeHref}
      startImmediately
    />
  );
}
