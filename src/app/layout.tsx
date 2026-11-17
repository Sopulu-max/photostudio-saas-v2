import './globals.css';
import type { Metadata } from 'next';
// Mounted at the true root so it covers the dashboard, the client portal and
// the public booking page alike — an action reports itself the same way
// wherever it was taken from.
import { Toaster } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'Weave',
  description: 'The operating system for studios',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">

      <body className="q-bg-surface-base q-text-body">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
