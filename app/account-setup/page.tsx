import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
export default async function AccountSetup({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Finish account setup</h1>
      <p>
        {reason === '403'
          ? 'Verify your primary email in your account settings before continuing.'
          : reason === '409'
            ? 'We could not link your account. The email may already belong to another account. Contact an administrator if retrying does not help.'
            : 'Sign in again to finish setting up your account.'}
      </p>
      <UserButton />
      <p>
        <Link href="/">Try again</Link>
      </p>
    </main>
  );
}
