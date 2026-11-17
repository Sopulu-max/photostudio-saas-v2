'use client';

import { useEffect, useState, useTransition } from 'react';
import { favourite, picksOf } from '@/weave/galleries/actions';
import type { PublicGallery } from '@/weave/galleries/shape';

const REMEMBERED = 'weave.visitor.email';

/**
 * The client's side of a gallery.
 *
 * Favouriting needs to know WHO, because a pick with no person attached cannot
 * answer the only question the studio has — are these the ones they want. The
 * email is asked for once and remembered in this browser, so the gallery opens
 * where they left it rather than blank every time.
 */
export function Viewer({ gallery }: { gallery: PublicGallery }) {
  const [email, setEmail] = useState('');
  const [typed, setTyped] = useState('');
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  useEffect(() => {
    try {
      const had = window.localStorage.getItem(REMEMBERED);
      if (had) setEmail(had);
    } catch {
      // Private window, or storage refused. The gallery still works; it just
      // asks again next time.
    }
  }, []);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    picksOf({ token: gallery.token, email })
      .then((ids) => { if (alive) setPicks(new Set(ids)); })
      .catch(() => { /* an empty gallery of picks is the right fallback */ });
    return () => { alive = false; };
  }, [email, gallery.token]);

  const remember = (e: React.FormEvent) => {
    e.preventDefault();
    const value = typed.trim();
    if (!value.includes('@')) { setProblem('That does not look like an email.'); return; }
    setProblem(null);
    setEmail(value);
    try { window.localStorage.setItem(REMEMBERED, value); } catch { /* fine */ }
  };

  const toggle = (fileId: string) => {
    if (!email) return;
    const on = !picks.has(fileId);
    // Answer the press, then reconcile. A gallery of four hundred frames that
    // waits for the network on every tap is not usable on a phone.
    setPicks((had) => {
      const next = new Set(had);
      if (on) next.add(fileId); else next.delete(fileId);
      return next;
    });
    setProblem(null);
    start(async () => {
      try {
        await favourite({ token: gallery.token, fileId, email, on });
      } catch (err) {
        setPicks((had) => {
          const next = new Set(had);
          if (on) next.delete(fileId); else next.add(fileId);
          return next;
        });
        setProblem(err instanceof Error ? err.message : 'That pick did not save');
      }
    });
  };

  return (
    <div className="q-gallery">
      <header className="q-gal-head-plain q-stack q-stack-xs">
        <span className="q-gal-studio">{gallery.studioName}</span>
        <h1 className="q-gal-title">{gallery.name}</h1>
        <p className="q-gal-sub">
          {gallery.files.length === 0
            ? 'Nothing here yet.'
            : picks.size === 0
              ? `${gallery.files.length} ${gallery.files.length === 1 ? 'picture' : 'pictures'}. Tap one to keep it.`
              : `${picks.size} of ${gallery.files.length} kept.`}
        </p>
      </header>

      <main className="q-gal-main q-stack q-stack-md">
        {!email && (
          <form className="q-card q-row q-row-sm" onSubmit={remember}>
            <input
              className="q-input"
              type="email"
              placeholder="Your email, to keep your picks"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button className="q-btn q-btn-primary" type="submit">Start picking</button>
          </form>
        )}

        {gallery.files.length === 0 ? (
          <p className="q-empty-lg">The studio has not put anything in here yet.</p>
        ) : (
          <div className="q-gal-grid">
            {gallery.files.map((f) => {
              const kept = picks.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={kept ? 'q-gal-tile q-gal-tile-chosen' : 'q-gal-tile'}
                  title={f.name}
                  disabled={!email || working}
                  onClick={() => toggle(f.id)}
                >
                  {f.url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={f.url}
                      alt={f.name}
                      onLoad={(e) => e.currentTarget.classList.add('q-gal-loaded')}
                    />
                  )}
                  {kept && <span className="q-gal-mark">Kept</span>}
                </button>
              );
            })}
          </div>
        )}

        {gallery.mayDownload && gallery.files.length > 0 && (
          <div className="q-gal-files">
            {gallery.files.map((f) => (
              <div key={f.id} className="q-gal-file">
                <span className="q-gal-file-n">{f.name}</span>
                {f.url && (
                  <a className="q-btn q-btn-ghost q-btn-xs" href={f.url} download={f.name}>
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {problem && <p className="q-meta">{problem}</p>}
      </main>
    </div>
  );
}
