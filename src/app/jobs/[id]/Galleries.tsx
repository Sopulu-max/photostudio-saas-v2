'use client';

import { useState, useTransition } from 'react';
import {
  makeGallery, fillGallery, shareGallery, allowDownload,
} from '@/weave/galleries/actions';
import { sellFrom } from '@/weave/store/actions';
import { sayGallery, type GallerySummary } from '@/weave/galleries/shape';
import type { PriceList } from '@/weave/store/shape';

/**
 * The galleries made from this job.
 *
 * A gallery is a named set of pictures shown to somebody outside. It is seeded
 * from what the studio chose, because that is what choosing was for — but the
 * set is copied in rather than derived, so unchoosing a frame later cannot
 * reach into a gallery the client is already looking at.
 */
export function Galleries({
  jobId, galleries, origin, lists,
}: {
  jobId: string;
  galleries: GallerySummary[];
  origin: string;
  lists: PriceList[];
}) {
  const [name, setName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  const make = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setProblem('A gallery needs a name.'); return; }
    run(async () => {
      await makeGallery({ jobId, name });
      setName('');
    });
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}/g/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setProblem('Could not copy the link; it is shown above.');
    }
  };

  return (
    <section className="q-card q-stack q-stack-sm">
      <h2 className="q-section-title">Galleries</h2>

      {galleries.length === 0 ? (
        <p className="q-empty">No gallery made from this job yet.</p>
      ) : (
        <div className="q-stack q-stack-sm">
          {galleries.map((g) => (
            <div key={g.id} className="q-tile q-stack q-stack-xs">
              <div className="q-row q-row-between">
                <strong className="q-strong">{g.name}</strong>
                <span className={g.sharedAt ? 'q-meta' : 'q-meta q-warm'}>{sayGallery(g)}</span>
              </div>

              {g.sharedAt && (
                <span className="q-meta-sm">{origin}/g/{g.token}</span>
              )}

              <div className="q-row q-row-sm">
                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                  onClick={() => run(() => shareGallery({
                    galleryId: g.id, jobId, shared: !g.sharedAt,
                  }))}
                >
                  {g.sharedAt ? 'Close it' : 'Send it'}
                </button>

                {g.sharedAt && (
                  <button
                    type="button" className="q-btn q-btn-ghost q-btn-xs"
                    onClick={() => void copy(g.token)}
                  >
                    {copied === g.token ? 'Link copied' : 'Copy the link'}
                  </button>
                )}

                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                  onClick={() => run(() => fillGallery({ galleryId: g.id, jobId }))}
                >
                  Put everything in
                </button>

                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                  onClick={() => run(() => allowDownload({
                    galleryId: g.id, jobId, may: !g.mayDownload,
                  }))}
                >
                  {g.mayDownload ? 'Stop downloads' : 'Allow downloads'}
                </button>
              </div>

              {/*
                * Most galleries are a delivery and not a shop, so selling is
                * off until a list is chosen rather than on by default.
                */}
              <label className="q-row q-row-sm">
                <span className="q-meta">Sells from</span>
                <select
                  className="q-input q-input-sm"
                  value={g.priceListId ?? ''}
                  disabled={working || lists.length === 0}
                  onChange={(e) => run(() => sellFrom({
                    galleryId: g.id, jobId, priceListId: e.target.value || null,
                  }))}
                >
                  <option value="">Nothing — just the pictures</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
      )}

      <form className="q-row q-row-sm" onSubmit={make}>
        <input
          className="q-input"
          placeholder="Name a new gallery"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={working}
        />
        <button className="q-btn q-btn-secondary" type="submit" disabled={working}>
          {working ? 'Making' : 'Make one'}
        </button>
      </form>

      {problem && <p className="q-meta">{problem}</p>}
    </section>
  );
}
