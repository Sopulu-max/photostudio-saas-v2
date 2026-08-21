import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listGalleries } from '@/modules/delivery/interface';
import { CopyGalleryLink } from './CopyGalleryLink';

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

      <div className="q-card q-table-container">
        <table className="q-table">
          <thead>
            <tr>
              <th className="q-table-th">Gallery</th>
              <th className="q-table-th">Client</th>
              <th className="q-table-th">Photos</th>
              <th className="q-table-th">Status</th>
              <th className="q-table-th">Client opened</th>
              <th className="q-table-th"></th>
            </tr>
          </thead>
          <tbody>
            {galleries.length === 0 ? (
              <tr>
                <td colSpan={6} className="q-table-td q-center-text q-muted">
                  No galleries yet. Open a <Link href="/bookings" className="q-plain-link">booking</Link> and bundle its finished work to make one.
                </td>
              </tr>
            ) : (
              galleries.map((g) => (
                <tr key={g.id} className="q-table-tr">
                  <td className="q-table-td q-strong">
                    {g.bookingId ? (
                      <Link href={`/bookings/${g.bookingId}`} className="q-plain-link">{g.title}</Link>
                    ) : (
                      g.title
                    )}
                    {g.bookingTitle && <div className="q-meta">{g.bookingTitle}</div>}
                  </td>
                  <td className="q-table-td q-meta">{g.clientName || '—'}</td>
                  <td className="q-table-td q-num">{g.fileCount}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${g.status === 'shared' ? 'q-badge-success' : 'q-badge-neutral'}`}>
                      {g.status === 'shared' ? 'shared' : 'not sent'}
                    </span>
                  </td>
                  <td className="q-table-td q-meta">
                    {g.status !== 'shared' ? '—' : shortDate(g.lastViewedAt) || 'Not yet'}
                  </td>
                  <td className="q-table-td">
                    <div className="q-row" style={{ justifyContent: 'flex-end' }}>
                      {g.status === 'shared' && g.shareToken && (
                        <>
                          <CopyGalleryLink token={g.shareToken} />
                          <a
                            href={`/gallery/${g.shareToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="q-btn q-btn-secondary q-btn-sm"
                          >
                            View
                          </a>
                        </>
                      )}
                      {g.bookingId && (
                        <Link href={`/bookings/${g.bookingId}`} className="q-btn q-btn-secondary q-btn-sm">
                          Open
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
