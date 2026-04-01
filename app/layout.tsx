import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { ErrorBoundary } from './components/ErrorBoundary';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'Spark! Next.js Template',
  description: 'Spark! Next.js Template',
  keywords: ['Next.js', 'React', 'TypeScript', 'Template'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${outfit.variable}`}>
        <body>
          <ErrorBoundary>
            <div className="main-content-container">{children}</div>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
