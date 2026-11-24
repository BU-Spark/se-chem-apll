import Link from 'next/link';
import formStyles from '@/app/components/InstructorForm/form.module.css';
import workspaceStyles from '@/app/workspaces/workspaces.module.css';
import QuestionPreview from '@/app/components/QuestionBank/QuestionPreview';
import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';
import { dbQuestionToAuthoring } from '@/app/components/QuestionBank/adapters';
import { requireWorkspace } from '@/lib/workspaces/access';
import { workspacePageAccess } from '@/lib/workspaces/pages';
import { workspaceAllows } from '@/lib/workspaces/permissions';
import { isAdmin } from '@/lib/auth/policy';
import { nodeLibraryScope } from '@/lib/workspaces/permissions';
import { notFound } from 'next/navigation';
import { requireAppUser } from '@/lib/auth/server';
import { prisma } from '@/lib/prisma';
import { nodeInclude } from '@/app/utils/nodeContent';
import NodeEditForm from '@/app/instructor/nodes/[nodeId]/edit/NodeEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ workspaceId: string; nodeId: string }>;
}

export default async function EditNodePage({ params }: Props) {
  const { nodeId, workspaceId } = await params;
  const user = await requireAppUser();

  const node = await prisma.node.findFirst({
    where: {
      id: nodeId,
      workspaceId,
      ...nodeLibraryScope(user),
    },
    include: nodeInclude,
  });

  if (!node) notFound();

  const workspace = await workspacePageAccess(() => requireWorkspace(user, workspaceId, 'content.read'));
  const editable = isAdmin(user) || workspaceAllows(workspace.members[0]?.role ?? null, 'content.edit');
  if (!editable)
    return (
      <div className={formStyles.form}>
        <header className={formStyles.pageHeader}>
          <Link className={workspaceStyles.backLink} href={`/workspaces/${workspaceId}`}>
            ← Back to library
          </Link>
          <h1 className={formStyles.pageTitle}>{node.title || 'Untitled node'}</h1>
          <p className={formStyles.pageSubtitle}>Read-only access · {node.isDraft ? 'Draft' : 'Published'}</p>
        </header>
        <section className={formStyles.section}>
          <h2 className={formStyles.sectionTitle}>Node details</h2>
          <p>{node.summary}</p>
          {node.videoUrl && (
            <a className={workspaceStyles.backLink} href={node.videoUrl}>
              Watch video
            </a>
          )}
          <h3 className={formStyles.sectionTitle}>Learning objectives</h3>
          <ul className={workspaceStyles.objectives}>
            {node.learningObjectives.map((objective, i) => (
              <li key={i}>{objective}</li>
            ))}
          </ul>
        </section>
        <section className={formStyles.section}>
          <h2 className={formStyles.sectionTitle}>Checkpoints</h2>
          {node.checkpoints.map((checkpoint) => (
            <section key={checkpoint.id}>
              <h3 className={formStyles.sectionTitle}>{checkpoint.checkpointKey}</h3>
              {checkpoint.questions.map((q) =>
                q.kind === 'NOTE' ? (
                  <MarkdownPreview key={q.id} content={q.prompt} />
                ) : (
                  <QuestionPreview key={q.id} question={dbQuestionToAuthoring(q)} />
                )
              )}
            </section>
          ))}
        </section>
        <section className={formStyles.section}>
          <h2 className={formStyles.sectionTitle}>Quiz bank</h2>
          {node.quizQuestions.map((q) => (
            <QuestionPreview key={q.id} question={dbQuestionToAuthoring(q)} />
          ))}
        </section>
      </div>
    );

  return (
    <NodeEditForm
      workspaceId={workspaceId}
      returnTo={`/workspaces/${workspaceId}`}
      node={{
        id: node.id,
        isDraft: node.isDraft,
        title: node.title,
        summary: node.summary ?? '',
        videoUrl: node.videoUrl ?? '',
        tags: node.tags,
        learningObjectives: node.learningObjectives,
        checkpoints: node.checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          timeOffsetSeconds: checkpoint.timeOffsetSeconds,
          checkpointKey: checkpoint.checkpointKey,
          placementHint: checkpoint.placementHint,
          questions: checkpoint.questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            feedbackCorrect: q.feedbackCorrect,
            feedbackIncorrect: q.feedbackIncorrect,
            options: q.options,
            correctIndices: q.correctIndices,
            kind: q.kind,
          })),
        })),
        quizQuestions: node.quizQuestions.map((q) => ({
          variants: q.variants,
          id: q.id,
          prompt: q.prompt,
          feedbackCorrect: q.feedbackCorrect,
          feedbackIncorrect: q.feedbackIncorrect,
          options: q.options,
          correctIndices: q.correctIndices,
        })),
      }}
    />
  );
}
