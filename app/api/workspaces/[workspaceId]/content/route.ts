import { apiAccess } from '@/lib/auth/api';
import { readObject, workspaceResponse } from '@/lib/workspaces/http';
import { movePersonalContent } from '@/lib/workspaces/service';
export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(async () => movePersonalContent(user, (await params).workspaceId, await readObject(req)));
}
