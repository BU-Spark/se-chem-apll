import { notFound, redirect } from 'next/navigation';
import { requireStudent } from '@/lib/auth/server';
import { canWatchVideo, getStudentNode } from '@/lib/studentNode';
import { ROUTES } from '@/app/routes';
import QevLesson from '@/app/components/QevLesson/QevLesson';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string; nodeId: string }>;
}

// The node's video lesson: from a regular node's intro, after a failed quiz, and to rewatch.
export default async function StudentNodeVideoPage({ params }: PageProps) {
  const student = await requireStudent();

  const { courseId, lessonId, nodeId } = await params;
  const view = await getStudentNode(student.id, courseId, lessonId, nodeId);
  if (!view) notFound();

  const nodeHref = ROUTES.studentNode(courseId, lessonId, nodeId);
  if (!canWatchVideo(view.screen)) redirect(nodeHref);

  return (
    <QevLesson
      courseLessonId={lessonId}
      lessonNodeId={nodeId}
      nodeTitle={view.node.title}
      video={view.video}
      timeline={view.timeline}
      resumeAt={view.resumeAt}
      lessonHref={ROUTES.studentLesson(courseId, lessonId)}
      // With questions, the node page shows the video result; without, there's nothing to grade,
      // so the student goes on to the quiz.
      doneHref={view.hasVideoQuestions ? nodeHref : ROUTES.studentNode(courseId, lessonId, nodeId, 'quiz')}
    />
  );
}
