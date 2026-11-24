import { apiAccess } from '@/lib/auth/api';
import { prisma } from '@/lib/prisma';
import { workspaceResponse, readObject } from '@/lib/workspaces/http';
import { createWorkspace } from '@/lib/workspaces/service';
export async function GET() {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(() =>
    prisma.workspace.findMany({
      where: { members: { some: { userId: user.id } } },
      include: { members: { where: { userId: user.id } } },
      orderBy: { name: 'asc' },
    })
  );
}
export async function POST(req: Request) {
  const { user, error } = await apiAccess();
  if (error) return error;
  return workspaceResponse(async () => createWorkspace(user, (await readObject(req)).name));
}
