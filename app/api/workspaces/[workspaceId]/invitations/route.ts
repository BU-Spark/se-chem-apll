import { apiAccess } from '@/lib/auth/api';
import { readObject, workspaceResponse } from '@/lib/workspaces/http';
import { inviteMember } from '@/lib/workspaces/service';
export async function POST(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(async () => {
    const body = await readObject(req);
    return inviteMember(user, (await params).workspaceId, body.email, body.role);
  });
}
