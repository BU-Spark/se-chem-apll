'use client';

import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DebugRolePage() {
  const { user } = useUser();
  const router = useRouter();
  const [clearing, setClearing] = useState(false);

  const currentRole = user?.unsafeMetadata?.role as string | undefined;

  async function clearRole() {
    if (!user) return;

    setClearing(true);
    try {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          role: undefined,
        },
      });
      alert('Role cleared! You will now be redirected to the role selection page.');
      router.push('/');
    } catch (error) {
      console.error('Error clearing role:', error);
      alert('Failed to clear role. Check console for details.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Debug Role Information</h1>

      <div style={{ background: '#f3f4f6', padding: '1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Current User Info</h2>
        <p>
          <strong>User ID:</strong> {user?.id || 'Not logged in'}
        </p>
        <p>
          <strong>Email:</strong> {user?.emailAddresses?.[0]?.emailAddress || 'N/A'}
        </p>
        <p>
          <strong>Current Role:</strong> {currentRole || 'NOT SET'}
        </p>
      </div>

      <div style={{ background: '#fef2f2', padding: '1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Issue Explanation</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          {currentRole
            ? `You already have a role set to "${currentRole}". This is why you're not seeing the role selection page.`
            : 'Your role is not set. You should see the role selection page.'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
        <button
          onClick={clearRole}
          disabled={clearing || !currentRole}
          style={{
            padding: '0.75rem 1.5rem',
            background: currentRole ? '#dc2626' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: currentRole ? 'pointer' : 'not-allowed',
            fontSize: '1rem',
            fontWeight: '600',
          }}
        >
          {clearing ? 'Clearing...' : 'Clear Role & Go to Selection'}
        </button>

        <Link
          href="/select-role"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#1f5fab',
            color: 'white',
            textAlign: 'center',
            textDecoration: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: '600',
          }}
        >
          Go to Role Selection Page Directly
        </Link>

        <Link
          href="/"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#6b7280',
            color: 'white',
            textAlign: 'center',
            textDecoration: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: '600',
          }}
        >
          Go to Home (Test Redirect Logic)
        </Link>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
        <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: '#6b7280' }}>Full Metadata:</h3>
        <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>{JSON.stringify(user?.unsafeMetadata, null, 2)}</pre>
      </div>
    </div>
  );
}
