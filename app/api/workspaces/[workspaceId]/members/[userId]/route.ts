import { apiAccess } from '@/lib/auth/api';
import { readObject, workspaceResponse } from '@/lib/workspaces/http';
import { changeMember } from '@/lib/workspaces/service';
type Context = { params: Promise<{ workspaceId: string; userId: string }> };
export async function PATCH(req: Request, { params }: Context) {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(async () => {
    const p = await params;
    return changeMember(user, p.workspaceId, p.userId, (await readObject(req)).role);
  });
}
export async function DELETE(_req: Request, { params }: Context) {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(async () => {
    const p = await params;
    return changeMember(user, p.workspaceId, p.userId, undefined, true);
  });
}
