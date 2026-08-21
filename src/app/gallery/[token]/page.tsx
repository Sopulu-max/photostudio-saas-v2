import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getGalleryByToken } from '@/modules/delivery/interface';
import { GalleryImages, DownloadAllButton, OtherFiles, type GalleryFile } from './GalleryClient';

export const dynamic = 'force-dynamic';

/**
 * Metadata and the page both need the gallery, and Next may run them in
 * parallel. Loading it twice would race the view stamp inside and could log the
 * client's first visit as two — deduped to one call per request.
 */
const loadGallery = cache(getGalleryByToken);

export async function generateMetadata(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const gallery = await loadGallery(token);
  if (!gallery) return { title: 'Gallery' };
  return {
    title: `${gallery.title} · ${gallery.studioName}`,
    // A shared link is pasted into messages and chat apps, which will render a
    // preview of it. Left alone that preview is the raw URL.
    description: gallery.bookingTitle || `${gallery.files.length} files from ${gallery.studioName}`,
    robots: { index: false, follow: false },
  };
}

/**
 * The client gallery. Public: the share token is the only capability.
 *
 * Nothing here is signed at render time — every image points back at the asset
 * route and is fetched lazily as it scrolls into view, so this page costs one
 * query whether the delivery holds six photographs or six hundred.
 */
export default async function GalleryPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const gallery = await loadGallery(token);

  if (!gallery) notFound();

  const files = gallery.files as GalleryFile[];
  const images = files.filter((f) => f.isImage);
  const others = files.filter((f) => !f.isImage);
  const cover = gallery.cover as GalleryFile | null;

  return (
    <div className="q-gal">
      <header className={`q-gal-cover${cover ? '' : ' q-gal-head-plain'}`}>
        {cover && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            className="q-gal-cover-img"
            src={`/gallery/${token}/asset/${cover.id}?size=full`}
            alt=""
            /* The one image worth blocking on: it is the whole first screen. */
            fetchPriority="high"
          />
        )}
        <div className="q-gal-cover-inner">
          {gallery.studioLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="q-gal-logo" src={gallery.studioLogoUrl} alt={gallery.studioName} />
          ) : (
            <div className="q-gal-studio">{gallery.studioName}</div>
          )}
          <h1 className="q-gal-title">{gallery.title}</h1>
          {gallery.bookingTitle && <p className="q-gal-sub">{gallery.bookingTitle}</p>}
        </div>
      </header>

      {files.length > 0 && (
        <div className="q-gal-bar">
          <div className="q-gal-bar-in">
            <span className="q-gal-count">
              {images.length > 0 && `${images.length} photo${images.length === 1 ? '' : 's'}`}
              {images.length > 0 && others.length > 0 && ' · '}
              {others.length > 0 && `${others.length} file${others.length === 1 ? '' : 's'}`}
            </span>
            <DownloadAllButton token={token} files={files} />
          </div>
        </div>
      )}

      <main className="q-gal-main">
        {files.length === 0 ? (
          <p className="q-center-text q-muted">Nothing here yet.</p>
        ) : (
          <>
            <GalleryImages token={token} images={images} />
            <OtherFiles token={token} files={others} />
          </>
        )}
      </main>
    </div>
  );
}
