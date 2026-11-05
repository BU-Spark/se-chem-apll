import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireStudent } from '@/lib/auth/server';
import { canWatchVideo, getStudentNode } from '@/lib/studentNode';
import { ROUTES } from '@/app/routes';
import QevLesson from '@/app/components/QevLesson/QevLesson';
import QevVideo from '@/app/components/QevVideo/QevVideo';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import buttons from '@/app/styles/buttons.module.css';
import styles from './page.module.css';

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

  const lessonHref = ROUTES.studentLesson(courseId, lessonId);

  // Without video questions there's nothing to record: watch, then continue to the quiz.
  if (!view.hasVideoQuestions) {
    return (
      <NodeScreenFrame closeHref={lessonHref}>
        <h1 className={styles.title}>{view.node.title} Video Lesson</h1>
        <div className={styles.video}>
          <QevVideo videoUrl={view.video.url} muxPlaybackId={view.video.muxPlaybackId} />
        </div>
        <Link href={ROUTES.studentNode(courseId, lessonId, nodeId, 'quiz')} className={buttons.primary}>
          Continue
        </Link>
      </NodeScreenFrame>
    );
  }

  return (
    <QevLesson
      courseLessonId={lessonId}
      lessonNodeId={nodeId}
      nodeTitle={view.node.title}
      video={view.video}
      questionTimes={view.questionTimes}
      lessonHref={lessonHref}
      doneHref={nodeHref}
    />
  );
}
