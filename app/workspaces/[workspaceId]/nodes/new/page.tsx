import Link from 'next/link';
import NodeForm from '@/app/components/NodeForm/NodeForm';
import { requireAppUser } from '@/lib/auth/server';
import { requireWorkspace } from '@/lib/workspaces/access';
import { workspacePageAccess } from '@/lib/workspaces/pages';
export default async function NewWorkspaceNode({ params }: { params: Promise<{ workspaceId: string }> }) {
  const user = await requireAppUser();
  const { workspaceId } = await params;
  const workspace = await workspacePageAccess(() => requireWorkspace(user, workspaceId, 'content.create'));
  return (
    <>
      <p>
        Creating in {workspace.name} · <Link href="/workspaces">Change workspace</Link>
      </p>
      <NodeForm mode="create" workspaceId={workspaceId} returnTo={`/workspaces/${workspaceId}`} />
    </>
  );
}
