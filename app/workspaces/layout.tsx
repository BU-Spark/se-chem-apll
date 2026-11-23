import { requireAppUser } from '@/lib/auth/server';
import InstructorShell from '@/app/components/InstructorShell/InstructorShell';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAppUser();
  return <InstructorShell user={user}>{children}</InstructorShell>;
}
