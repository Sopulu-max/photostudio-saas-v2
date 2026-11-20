import './globals.css';
import type { Metadata } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
// Mounted at the true root so it covers the studio and the client's gallery
// alike — an action reports itself the same way wherever it was taken from.
import { Toaster } from '@/components/Toast';
import { themeScript } from '@/components/Theme';

/*
 * Two faces, and the split between them is the whole typographic idea: a
 * high-contrast serif for the things a client reads as a title, and a plain
 * humanist sans for everything that is interface.
 *
 * Self-hosted by next/font rather than fetched from a font CDN, so a gallery
 * opens at the same speed on a phone in a car park as it does here, and no
 * third party learns who is looking at a studio's work.
 */
const display = Playfair_Display({
  subsets: ['latin'],
  variable: '--display',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--sans',
  display: 'swap',
});

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
    <html lang="en" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        {/*
          * Before the first paint. Without it the page renders light and then
          * corrects itself, which is a white flash on every navigation for
          * exactly the person who asked for dark mode.
          */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
