import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  // Temporary logging for the CI test PR; remove when the experiment is done.
  console.log('[ci-test] Home page role routing started');
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Get user to check if they have a role selected
  const user = await currentUser();
  const userRole = user?.unsafeMetadata?.role as string | undefined;
  console.log('[ci-test] Home page role lookup completed');

  // If no role is set, redirect to role selection
  if (!userRole) {
    redirect('/select-role');
  }

  // Redirect based on role
  if (userRole === 'instructor') {
    redirect('/instructor');
  } else {
    redirect('/student');
  }
}
