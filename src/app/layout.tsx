import './globals.css';
import type { Metadata } from 'next';

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
      <body className="q-bg-surface-base q-text-body">{children}</body>
    </html>
  );
}
