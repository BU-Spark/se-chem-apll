import { notFound, redirect } from 'next/navigation';
import { requireStudent } from '@/lib/auth/server';
import { canWatchVideo, getStudentNode } from '@/lib/studentNode';
import { ROUTES } from '@/app/routes';
import QevLesson from '@/app/components/QevLesson/QevLesson';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string; nodeId: string }>;
  // ?restart=1 (the result page's Rewatch): start over from 0:00, with the questions.
  searchParams: Promise<{ restart?: string }>;
}

// The node's video lesson: from a regular node's intro, after a failed quiz, and to rewatch.
export default async function StudentNodeVideoPage({ params, searchParams }: PageProps) {
  const student = await requireStudent();

  const { courseId, lessonId, nodeId } = await params;
  const view = await getStudentNode(student.id, courseId, lessonId, nodeId);
  if (!view) notFound();

  const nodeHref = ROUTES.studentNode(courseId, lessonId, nodeId);
  if (!canWatchVideo(view.screen)) redirect(nodeHref);

  const restart = (await searchParams).restart === '1';
  // This round's answers are already saved: continue from where the student stopped (or show the
  // end if they finished), without asking the questions again.
  const answered = view.screen === 'VIDEO_RESULT' && !restart;

  return (
    <QevLesson
      courseLessonId={lessonId}
      lessonNodeId={nodeId}
      nodeTitle={view.node.title}
      video={view.video}
      timeline={answered ? view.timeline.filter((item) => item.kind === 'NOTE') : view.timeline}
      resumeAt={restart ? 0 : view.resumeAt}
      lessonHref={ROUTES.studentLesson(courseId, lessonId)}
      // With questions, the node page shows the video result; without, there's nothing to grade,
      // so the student goes on to the quiz.
      doneHref={view.hasVideoQuestions ? nodeHref : ROUTES.studentNode(courseId, lessonId, nodeId, 'quiz')}
    />
  );
}
