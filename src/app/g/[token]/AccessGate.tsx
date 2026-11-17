'use client';

import { useState, useTransition } from 'react';
import { unlockGallery } from '@/weave/galleries/actions';

/** The code gate is intentionally small: it guards the photographs, not the welcome. */
export function AccessGate({ token, studioName, name }: {
  token: string; studioName: string; name: string;
}) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const unlock = (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);
    start(async () => {
      try {
        await unlockGallery({ token, code });
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'Could not open this gallery');
      }
    });
  };

  return (
    <main className="q-gallery q-stack q-stack-md">
      <header className="q-gal-head-plain q-stack q-stack-xs">
        <span className="q-gal-studio">{studioName}</span>
        <h1 className="q-gal-title">{name}</h1>
        <p className="q-gal-sub">This gallery is private.</p>
      </header>
      <form className="q-card q-stack q-stack-sm" onSubmit={unlock}>
        <label className="q-label" htmlFor="gallery-access-code">Access code</label>
        <input
          id="gallery-access-code"
          className="q-input"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={working}
        />
        <button className="q-btn q-btn-primary" type="submit" disabled={working || !code}>
          {working ? 'Opening' : 'Open gallery'}
        </button>
        {problem && <p className="q-meta">{problem}</p>}
      </form>
    </main>
  );
}
