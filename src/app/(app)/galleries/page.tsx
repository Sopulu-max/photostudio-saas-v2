import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listGalleries } from '@/modules/delivery/interface';
import { CopyGalleryLink } from './CopyGalleryLink';
import { SheetRow, initialsFor } from '@/components/Sheet';

export const dynamic = 'force-dynamic';

function shortDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function GalleriesPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const galleries = await listGalleries();
  const unsent = galleries.filter((g) => g.status !== 'shared').length;
  const unopened = galleries.filter((g) => g.status === 'shared' && !g.lastViewedAt).length;

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Galleries</h1>
        <p className="q-page-subtitle">
          Every gallery in the studio. Galleries are made on a booking — open one to add photos or change what the client sees.
        </p>
      </header>

      {(unsent > 0 || unopened > 0) && (
        <p className="q-meta" style={{ marginBottom: '16px' }}>
          {unsent > 0 && <>{unsent} not sent yet.</>}
          {unsent > 0 && unopened > 0 && ' '}
          {unopened > 0 && <>{unopened} sent but never opened.</>}
        </p>
      )}

      {galleries.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <h3 className="q-section-title">No galleries yet</h3>
          <p className="q-meta">
            Open a <Link href="/bookings" className="q-plain-link">booking</Link> and bundle its finished work to make one.
          </p>
        </div>
      ) : (
        /*
         * A sheet of photographs, as a list of galleries should be (D4). The
         * frame is the gallery's cover - the studio's own work, at last seen
         * by the studio - and the caption is who it is for and what it holds.
         * The figure is when the client last opened it: the one fact about a
         * sent gallery the studio actually checks this page for. Not sent is
         * the warm figure, since it is the one needing the studio (D3).
         */
        <div className="q-sheet">
          {galleries.map((g) => (
            <SheetRow
              key={g.id}
              item={{
                id: g.id,
                href: g.bookingId ? `/bookings/${g.bookingId}` : '#',
                name: g.title,
                caption: [
                  g.clientName,
                  g.fileCount > 0 ? `${g.fileCount} ${g.fileCount === 1 ? 'photo' : 'photos'}` : null,
                ],
                absent: 'Empty - nothing in it yet',
                frame: { url: g.coverUrl, initials: initialsFor(g.clientName || g.title) },
                figure: g.status !== 'shared'
                  ? { text: 'Not sent', due: true }
                  : g.lastViewedAt
                    ? { text: `Opened ${shortDate(g.lastViewedAt)}` }
                    : { text: 'Sent, not opened', none: true },
                action: g.status === 'shared' && g.shareToken
                  ? <span className="q-row q-row-sm">
                      <CopyGalleryLink token={g.shareToken} />
                      <a href={`/gallery/${g.shareToken}`} target="_blank" rel="noopener noreferrer" className="q-btn q-btn-secondary q-btn-xs">View</a>
                    </span>
                  : undefined,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
