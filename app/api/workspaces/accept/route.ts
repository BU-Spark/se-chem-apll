import { apiAccess } from '@/lib/auth/api';
import { readObject, workspaceResponse } from '@/lib/workspaces/http';
import { acceptInvitation } from '@/lib/workspaces/service';
export async function POST(req: Request) {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(async () => acceptInvitation(user, (await readObject(req)).token));
}
