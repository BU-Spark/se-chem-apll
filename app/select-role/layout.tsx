import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Select Role - Spark 26',
  description: 'Choose your role to get started',
};

export default function SelectRoleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
