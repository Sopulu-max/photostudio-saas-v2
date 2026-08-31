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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          * The theme, decided before the first pixel.
          *
          * A PLAIN script, in the head, on purpose. This was <Script
          * strategy="beforeInteractive">, which reads as though it runs first
          * and does not: Next rewrites it into a queue — self.__next_s.push(…)
          * — placed in the BODY and drained once the framework bundle has
          * loaded. So every full page load painted light, booted JavaScript,
          * then flipped to dark. That is the flashing, and it was on every
          * page. Next's own documentation says as much: beforeInteractive
          * "does not block page hydration", and every example it gives loads an
          * external src. It is not a mechanism for running code before paint.
          *
          * A bare inline script in the head is. The browser executes it while
          * parsing, before it has painted anything, so the attribute is on
          * <html> by the time the first rule is applied and there is nothing to
          * correct afterwards.
          *
          * It resolves FULLY — an explicit choice, else what the machine says —
          * because the dark tokens live in one block keyed on data-theme rather
          * than in a prefers-color-scheme query. One place to change a colour,
          *
          * We use next/script with strategy="beforeInteractive" which is the
          * modern Next.js way to handle early-running scripts without warnings.
          */}
        <script
          id="theme-script"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`
          }}
        />
      </head>
      <body className="q-bg-surface-base q-text-body">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
