'use client';

import { useCallback, useEffect } from 'react';

/**
 * One frame, as large as the screen allows.
 *
 * This is where a client actually spends their time — a grid is for finding,
 * a lightbox is for looking. So the chrome is almost nothing: a count, a way
 * out, and the two things they might want to do with the picture in front of
 * them. Everything else waits.
 *
 * On paper rather than on black, because the rest of the gallery is on paper
 * and a photograph dropped onto a black screen announces a different product.
 */
export type LightboxFile = {
  id: string;
  name: string;
  mimeType: string | null;
  url: string | null;
};

export function Lightbox({
  files, index, kept, canKeep, canBuy, canDownload, downloading,
  onClose, onMove, onToggleKeep, onBuy, onDownload,
}: {
  files: LightboxFile[];
  index: number;
  kept: boolean;
  canKeep: boolean;
  canBuy: boolean;
  /** Downloading belongs where the picture is, not in a list of filenames. */
  canDownload: boolean;
  downloading: boolean;
  onClose: () => void;
  onMove: (next: number) => void;
  onToggleKeep: (fileId: string) => void;
  onBuy: (fileId: string) => void;
  onDownload: (fileId: string) => void;
}) {
  const file = files[index];

  const step = useCallback((by: number) => {
    if (files.length === 0) return;
    onMove((index + by + files.length) % files.length);
  }, [files.length, index, onMove]);

  /*
   * The keyboard is the whole point of a lightbox on a laptop. Arrows move,
   * Escape leaves, and the handler is removed when it closes so a gallery left
   * open in a tab does not keep eating key presses.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    // While it is open the page behind must not scroll under it.
    const had = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = had;
    };
  }, [onClose, step]);

  if (!file) return null;

  const isVideo = (file.mimeType ?? '').startsWith('video/');

  return (
    <div className="q-lb" role="dialog" aria-modal="true" aria-label={file.name}>
      <div className="q-lb-bar">
        <span className="q-lb-count">{index + 1} / {files.length}</span>
        <button type="button" className="q-lb-x" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>

      <div className="q-lb-stage">
        <button
          type="button" className="q-lb-nav q-lb-prev"
          onClick={() => step(-1)} aria-label="Previous"
          disabled={files.length < 2}
        >
          &#8249;
        </button>

        {isVideo ? (
          <video className="q-lb-media" src={file.url ?? undefined} controls autoPlay playsInline />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className="q-lb-media" src={file.url ?? undefined} alt={file.name} />
        )}

        <button
          type="button" className="q-lb-nav q-lb-next"
          onClick={() => step(1)} aria-label="Next"
          disabled={files.length < 2}
        >
          &#8250;
        </button>
      </div>

      <div className="q-lb-foot">
        <span className="q-lb-name">{file.name}</span>
        <span className="q-row q-row-sm">
          {canKeep && (
            <button
              type="button"
              className={kept ? 'q-btn q-btn-primary q-btn-sm' : 'q-btn q-btn-secondary q-btn-sm'}
              onClick={() => onToggleKeep(file.id)}
            >
              {kept ? 'Kept' : 'Keep this one'}
            </button>
          )}
          {canBuy && (
            <button
              type="button" className="q-btn q-btn-secondary q-btn-sm"
              onClick={() => onBuy(file.id)}
            >
              Order a print
            </button>
          )}
          {canDownload && (
            <button
              type="button" className="q-btn q-btn-ghost q-btn-sm"
              onClick={() => onDownload(file.id)} disabled={downloading}
            >
              {downloading ? 'Preparing' : 'Download'}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
