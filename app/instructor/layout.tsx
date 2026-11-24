import { requireInstructor } from '@/lib/auth/server';
import InstructorShell from '@/app/components/InstructorShell/InstructorShell';
export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireInstructor();
  return <InstructorShell user={user}>{children}</InstructorShell>;
}
