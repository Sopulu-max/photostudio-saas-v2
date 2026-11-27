import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { allGalleries } from '@/weave/galleries/actions';

export const dynamic = 'force-dynamic';

/**
 * Every gallery the studio has made.
 *
 * Covers, not a table. A studio looking for one of these recognises it by the
 * picture long before it reads the name, and a list of names is the slowest
 * possible way to find a photograph.
 */
export default async function GalleriesPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const [galleries, head] = await Promise.all([allGalleries(), headers()]);
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const scheme = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${scheme}://${host}`;

  const open = galleries.filter((g) => g.sharedAt).length;
  const said = galleries.length === 0
    ? 'No galleries yet. They are made from a booking.'
    : `${galleries.length} ${galleries.length === 1 ? 'gallery' : 'galleries'}, ${open} open to clients.`;

  return (
      <div className="q-page">
        <header className="q-page-header">
          <div>
            <h1 className="q-page-title">Galleries</h1>
            <p className="q-page-subtitle">{said}</p>
          </div>
        </header>

        {galleries.length === 0 ? (
          <p className="q-empty-lg">
            Open a booking and make one there — a gallery is built from a booking&rsquo;s pictures.
          </p>
        ) : (
          <div className="q-gal-grid">
            {galleries.map((g) => (
              <Link
                key={g.id}
                href={g.bookingId ? `/bookings/${g.bookingId}` : `/g/${g.token}`}
                className="q-card q-plain-link q-stack q-stack-xs"
              >
                {g.coverUrl ? (
                  <span className="q-gal-tile">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.coverUrl}
                      alt={g.name}
                      className="q-gal-loaded"
                    />
                  </span>
                ) : (
                  <span className="q-gal-tile" aria-hidden="true" />
                )}

                <strong className="q-card-name">{g.name}</strong>
                <span className="q-card-what">{g.clientName ?? 'No client named'}</span>
                <span className={g.sharedAt ? 'q-card-when' : 'q-card-when q-warm'}>
                  {g.howMany === 0
                    ? 'Empty'
                    : !g.sharedAt
                      ? `${g.howMany} pictures, not sent`
                      : g.expiresOn
                        ? `${g.howMany} pictures, open until ${g.expiresOn}`
                        : `${g.howMany} pictures, open`}
                  {g.orders > 0 && ` · ${g.orders} ${g.orders === 1 ? 'order' : 'orders'}`}
                </span>
                {g.sharedAt && <span className="q-share">{origin}/g/{g.token}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
  );
}
