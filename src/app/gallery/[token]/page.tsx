import { notFound } from 'next/navigation';
import { getGalleryByToken } from '@/modules/delivery/interface';

export const dynamic = 'force-dynamic';

/**
 * The client gallery. Public: the share token is the only capability. Files stay
 * private in storage — these are short-lived signed URLs minted per view.
 */
export default async function GalleryPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const gallery = await getGalleryByToken(token);

  if (!gallery) notFound();

  const images = gallery.files.filter((f: any) => f.isImage && f.url);
  const others = gallery.files.filter((f: any) => !f.isImage && f.url);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--q-color-paper-subtle)' }}>
      <header style={{ padding: '28px 24px', background: 'var(--q-color-paper)', borderBottom: '1px solid var(--q-color-ink-100)', textAlign: 'center' }}>
        <div style={{ fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>
          {gallery.studioName}
        </div>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 620, letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)' }}>
          {gallery.title}
        </h1>
        {gallery.bookingTitle && (
          <p style={{ margin: '6px 0 0', color: 'var(--q-color-ink-500)' }}>{gallery.bookingTitle}</p>
        )}
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 72px' }}>
        {gallery.files.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>Nothing here yet.</p>
        ) : (
          <>
            {images.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '18px' }}>
                {images.map((f: any) => (
                  <figure key={f.id} style={{ margin: 0, background: 'var(--q-color-paper)', border: '1px solid var(--q-color-ink-100)', borderRadius: '12px', overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.name} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                    <figcaption style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 12px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <a href={f.url} download={f.name} className="q-btn q-btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px', flexShrink: 0 }}>
                        Download
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            {others.length > 0 && (
              <div style={{ marginTop: images.length > 0 ? '32px' : 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {others.map((f: any) => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--q-color-paper)', border: '1px solid var(--q-color-ink-100)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.9rem' }}>{f.name}</span>
                    <a href={f.url} download={f.name} className="q-btn q-btn-secondary" style={{ fontSize: '0.8rem' }}>Download</a>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
