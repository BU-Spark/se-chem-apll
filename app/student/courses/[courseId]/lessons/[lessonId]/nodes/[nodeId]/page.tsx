import { notFound, redirect } from 'next/navigation';
import { requireStudent } from '@/lib/auth/server';
import { getStudentNode } from '@/lib/studentNode';
import { ROUTES } from '@/app/routes';
import NodeQuiz from '@/app/components/NodeQuiz/NodeQuiz';
import NodeIntro from '@/app/components/NodeIntro/NodeIntro';
import NodeComplete from '@/app/components/NodeComplete/NodeComplete';
import RefreshKnowledge from '@/app/components/RefreshKnowledge/RefreshKnowledge';
import VideoResult from '@/app/components/VideoResult/VideoResult';
import KeepMovingForward from '@/app/components/KeepMovingForward/KeepMovingForward';
import NodeIncomplete from '@/app/components/NodeIncomplete/NodeIncomplete';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string; nodeId: string }>;
}

// Shows the screen for where the student is in the node's workflow (see nodeScreen).
export default async function StudentNodePage({ params }: PageProps) {
  const student = await requireStudent();

  const { courseId, lessonId, nodeId } = await params;
  const view = await getStudentNode(student.id, courseId, lessonId, nodeId);
  if (!view) notFound();

  const lessonHref = ROUTES.studentLesson(courseId, lessonId);
  const nodeHref = ROUTES.studentNode(courseId, lessonId, nodeId);
  const videoHref = ROUTES.studentNode(courseId, lessonId, nodeId, 'video');
  const quizHref = ROUTES.studentNode(courseId, lessonId, nodeId, 'quiz');
  // Locked nodes can't be opened yet; send the student back to the lesson map.
  if (view.screen === 'LOCKED') redirect(lessonHref);

  const quizScore = { correct: view.lastQuiz?.correct ?? 0, total: view.lastQuiz?.total ?? 0 };

  switch (view.screen) {
    case 'INTRO':
      return (
        <NodeIntro
          nodeTitle={view.node.title}
          learningObjectives={view.node.learningObjectives}
          lessonHref={lessonHref}
          videoHref={videoHref}
        />
      );
    case 'COMPLETE':
      return <NodeComplete lessonHref={lessonHref} {...quizScore} coursePercent={view.coursePercent} />;
    case 'REFRESH':
      return (
        <RefreshKnowledge
          lessonHref={lessonHref}
          videoHref={videoHref}
          learningObjectives={view.node.learningObjectives}
          {...quizScore}
          coursePercent={view.coursePercent}
        />
      );
    case 'RETRY':
      return (
        <KeepMovingForward
          {...quizScore}
          coursePercent={view.coursePercent}
          lessonHref={lessonHref}
          // Foundational nodes retry through the video lesson; regular nodes go straight to the quiz.
          retryHref={view.node.isFoundational ? videoHref : quizHref}
        />
      );
    case 'INCOMPLETE':
      return <NodeIncomplete {...quizScore} coursePercent={view.coursePercent} lessonHref={lessonHref} />;
    case 'VIDEO_RESULT':
      return (
        <VideoResult
          passed={view.lastVideo!.passed}
          isFoundational={view.node.isFoundational}
          correct={view.lastVideo!.correct}
          total={view.lastVideo!.total}
          coursePercent={view.coursePercent}
          lessonHref={lessonHref}
          rewatchHref={videoHref}
          quizHref={quizHref}
        />
      );
    default:
      return (
        <NodeQuiz
          courseLessonId={lessonId}
          lessonNodeId={nodeId}
          nodeTitle={view.node.title}
          lessonHref={lessonHref}
          doneHref={nodeHref}
        />
      );
  }
}
