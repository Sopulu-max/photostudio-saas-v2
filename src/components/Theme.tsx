'use client';

import { useEffect, useState } from 'react';

/**
 * Light or dark, and remembering which.
 *
 * Three states, not two. "System" is the default and the honest one: an
 * operator who has set their laptop to go dark at sunset has already said
 * what they want, and an app that ignores that is making them say it twice.
 * Light and dark are overrides for when they disagree with the machine.
 */
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'weave.theme';

/**
 * Runs before the first paint, in the document head.
 *
 * Without this the page renders light, then corrects itself once React has
 * hydrated — a white flash on every navigation for somebody working at
 * night, which is exactly who dark mode is for. It is inline and
 * synchronous for that reason, and small enough to read in one go.
 *
 * Written as a string because it must execute before any bundle loads.
 */
export const themeScript = `
(function(){
  try {
    var saved = localStorage.getItem('${KEY}');
    var dark = saved === 'dark' ||
      ((!saved || saved === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {
    /* Private browsing blocks storage. Light is the safe default. */
  }
})();
`;

function apply(theme: Theme) {
  const root = document.documentElement;
  const dark = theme === 'dark'
    || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  /*
   * Read after mount, never during render: the server has no localStorage,
   * and guessing would make the markup disagree with itself. The inline
   * script has already painted the right colours by now, so there is
   * nothing to see while this catches up.
   */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') setTheme(saved);
    } catch { /* storage unavailable */ }
  }, []);

  /* Following the system means following it when it changes, not just at load. */
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const watch = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    watch.addEventListener('change', onChange);
    return () => watch.removeEventListener('change', onChange);
  }, [theme]);

  const choose = (next: Theme) => {
    setTheme(next);
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  };

  return (
    <div className="q-theme" role="group" aria-label="Appearance">
      {(['light', 'system', 'dark'] as Theme[]).map((option) => (
        <button
          key={option}
          type="button"
          className={option === theme ? 'q-theme-pick q-theme-on' : 'q-theme-pick'}
          aria-pressed={option === theme}
          onClick={() => choose(option)}
        >
          {option === 'system' ? 'Auto' : option === 'light' ? 'Light' : 'Dark'}
        </button>
      ))}
    </div>
  );
}
