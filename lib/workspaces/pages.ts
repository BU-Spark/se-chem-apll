import { notFound } from 'next/navigation';
import { AuthError } from '@/lib/auth/policy';
export async function workspacePageAccess<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AuthError) notFound();
    throw error;
  }
}
