'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Sun, Moon, MonitorSmartphone } from 'lucide-react';

/**
 * Light, dark, or whatever the machine says.
 *
 * Three states, not two. Two states meant that the first click pinned the app
 * forever — a studio that tried dark once could never get back to following its
 * desktop, and one that never clicked got a light app on a dark machine. Neither
 * is a preference anyone expressed.
 *
 * "System" is stored as the ABSENCE of a key rather than the string 'system',
 * so the only persisted values are ones a studio actually chose. And while in
 * system mode it keeps listening: a desktop that flips at sunset flips the app
 * with it, without a reload.
 *
 * Nothing here reads `matchMedia` during render. The server has no window, so a
 * label built from it says "(light)" on the server and "(dark)" in the browser —
 * a hydration mismatch, which is exactly what the first version of this did. The
 * resolved value lives in state and arrives after mount; until then the button
 * says only what is true everywhere.
 */

type Choice = 'system' | 'light' | 'dark';

const readSystem = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark' | null>(null);

  const apply = useCallback((next: Choice) => {
    const resolved = next === 'system' ? readSystem() : next;
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  useEffect(() => {
    setSystemTheme(readSystem());
    try {
      const stored = localStorage.getItem('theme');
      setChoice(stored === 'dark' || stored === 'light' ? stored : 'system');
    } catch { /* private mode — system it is */ }
  }, []);

  // The system only gets to change it while we are following the system.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setSystemTheme(readSystem());
      if (choice === 'system') apply('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice, apply]);

  const cycle = () => {
    const next: Choice = choice === 'system' ? 'light' : choice === 'light' ? 'dark' : 'system';
    setChoice(next);
    apply(next);
    try {
      if (next === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch { /* nothing to persist to; the session still honours it */ }
  };

  // Identical on the server and on the first client render.
  const label =
    systemTheme === null ? 'Light, dark, or follow your system'
    : choice === 'system' ? `Following your system (${systemTheme}) — switch to light`
    : choice === 'light' ? 'Light — switch to dark'
    : 'Dark — follow your system';

  return (
    <button
      onClick={cycle}
      aria-label={label}
      title={label}
      className="q-btn q-btn-secondary"
      style={{ padding: '7px', borderRadius: '10px' }}
    >
      {choice === 'system' ? <MonitorSmartphone size={16} />
        : choice === 'light' ? <Sun size={16} />
        : <Moon size={16} />}
    </button>
  );
}
