import { redirect } from 'next/navigation';
import { requireAppUser, homeFor } from '@/lib/auth/server';

export default async function HomePage() {
  const user = await requireAppUser();
  redirect(homeFor(user));
}
