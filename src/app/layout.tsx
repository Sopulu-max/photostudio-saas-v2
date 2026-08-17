import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';

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
      <body className="q-bg-surface-base q-text-body">
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            /*
             * Resolve the theme before first paint, and resolve it FULLY — an
             * explicit choice if there is one, otherwise whatever the machine
             * is set to. It used to stamp the attribute only for an explicit
             * choice, so a studio on a dark desktop got a light app until it
             * found the toggle.
             *
             * Resolving here rather than in a `prefers-color-scheme` media
             * query is deliberate: the dark tokens then live in exactly one
             * block in globals.css instead of two that drift apart. Same
             * centralization rule as everything else.
             */
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
