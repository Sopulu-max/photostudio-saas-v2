'use client';

import { useCallback, useEffect, useState } from 'react';

export type GalleryFile = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  isImage: boolean;
};

/** Where a file lives, at a size. Mirrors the asset route's contract. */
function assetUrl(token: string, id: string, size: 'grid' | 'full' | 'original', download = false) {
  return `/gallery/${token}/asset/${id}?size=${size}${download ? '&download=1' : ''}`;
}

function readableSize(bytes: number | null) {
  if (!bytes) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) { n /= 1024; u += 1; }
  return `${n < 10 && u > 0 ? n.toFixed(1) : Math.round(n)} ${units[u]}`;
}

/**
 * The images, and the viewer they open into.
 *
 * Every tile is a lazy <img> pointing back at the asset route, so a gallery of
 * any size costs nothing until it is scrolled. The full-size rendition is only
 * ever fetched by the lightbox, and the original only by a download.
 */
export function GalleryImages({ token, images }: { token: string; images: GalleryFile[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  const close = useCallback(() => setOpenAt(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpenAt((at) => {
        if (at === null) return at;
        const next = at + delta;
        return next < 0 || next >= images.length ? at : next;
      }),
    [images.length]
  );

  useEffect(() => {
    if (openAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    // The page behind the lightbox scrolling under it reads as a bug on
    // trackpads and is the usual way a viewer loses its place.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [openAt, close, step]);

  const current = openAt === null ? null : images[openAt];

  return (
    <>
      <div className="q-gal-grid">
        {images.map((f, i) => (
          <button
            key={f.id}
            type="button"
            className="q-gal-tile"
            onClick={() => setOpenAt(i)}
            aria-label={`Open ${f.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl(token, f.id, 'grid')}
              alt={f.name}
              loading="lazy"
              decoding="async"
              className={loaded[f.id] ? 'q-gal-loaded' : undefined}
              onLoad={() => setLoaded((m) => ({ ...m, [f.id]: true }))}
            />
          </button>
        ))}
      </div>

      {current && (
        <div className="q-lb" role="dialog" aria-modal="true" aria-label={current.name}>
          <div className="q-lb-bar">
            <span className="q-lb-name">
              {openAt! + 1} / {images.length} &nbsp;·&nbsp; {current.name}
            </span>
            <span className="q-row">
              <a className="q-lb-btn" href={assetUrl(token, current.id, 'original', true)} download={current.name}>
                Download
              </a>
              <button type="button" className="q-lb-btn" onClick={close} aria-label="Close">
                Close
              </button>
            </span>
          </div>

          <div className="q-lb-stage">
            <button
              type="button"
              className="q-lb-btn q-lb-nav q-lb-prev"
              onClick={() => step(-1)}
              disabled={openAt === 0}
              aria-label="Previous"
            >
              ‹
            </button>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={current.id} className="q-lb-img" src={assetUrl(token, current.id, 'full')} alt={current.name} />

            <button
              type="button"
              className="q-lb-btn q-lb-nav q-lb-next"
              onClick={() => step(1)}
              disabled={openAt === images.length - 1}
              aria-label="Next"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Hand over everything, one file at a time.
 *
 * Deliberately not a server-built zip: a wedding gallery is several gigabytes,
 * and assembling that in a request would hold it all in memory and time out
 * long before it finished. Downloading them individually is slower to watch but
 * works at any size, and the client keeps the originals' filenames.
 */
export function DownloadAllButton({ token, files }: { token: string; files: GalleryFile[] }) {
  const [done, setDone] = useState<number | null>(null);

  const run = async () => {
    setDone(0);
    for (const [i, f] of files.entries()) {
      const a = document.createElement('a');
      a.href = assetUrl(token, f.id, 'original', true);
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDone(i + 1);
      // Browsers drop downloads fired in a tight loop; this is the spacing at
      // which every file reliably lands.
      await new Promise((r) => setTimeout(r, 700));
    }
    setTimeout(() => setDone(null), 2500);
  };

  if (files.length === 0) return null;

  return (
    <button type="button" className="q-btn q-btn-primary q-btn-sm" onClick={run} disabled={done !== null}>
      {done === null
        ? `Download all (${files.length})`
        : done === files.length
          ? 'Done'
          : `Downloading ${done}/${files.length}…`}
    </button>
  );
}

/** Files that are not photographs — albums, documents, whatever else was sold. */
export function OtherFiles({ token, files }: { token: string; files: GalleryFile[] }) {
  if (files.length === 0) return null;
  return (
    <>
      <h2 className="q-gal-files-t">Other files</h2>
      <div className="q-gal-files">
        {files.map((f) => {
          const size = readableSize(f.sizeBytes);
          return (
            <div className="q-gal-file" key={f.id}>
              <span className="q-gal-file-n">
                {f.name}
                {size && <span className="q-muted"> · {size}</span>}
              </span>
              <a
                className="q-btn q-btn-secondary q-btn-sm"
                href={assetUrl(token, f.id, 'original', true)}
                download={f.name}
              >
                Download
              </a>
            </div>
          );
        })}
      </div>
    </>
  );
}
