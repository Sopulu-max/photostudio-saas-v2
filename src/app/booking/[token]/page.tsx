import { notFound } from 'next/navigation';
import { getBookingByShareToken } from '@/modules/bookings/interface';
import { BookingDocument } from '@/components/BookingDocument';
import { PrintDocumentButton } from '@/components/PrintDocumentButton';
import { DownloadDocumentButton } from '@/components/DownloadDocumentButton';

export const dynamic = 'force-dynamic';

/**
 * Where the confirmation document is rendered.
 *
 * This exists because a PDF has to be printed FROM something — renderPageToPdf
 * loads a URL in a headless browser, and it says plainly that the URL has to
 * open without a session or it renders the login page. So the token page is
 * not an alternative to the document; it is what the document is made of.
 *
 * It is also the copy a client can open on a phone without downloading
 * anything, which is why it carries Print and Download rather than being
 * hidden. The studio hands over a file; this is where that file comes from.
 */
export default async function ClientBookingDocumentPage(
  props: { params: Promise<{ token: string }> },
) {
  const params = await props.params;
  const booking = await getBookingByShareToken(params.token);
  // A revoked token is indistinguishable from one that never existed, which is
  // the point of revoking.
  if (!booking) notFound();

  const studio = (booking as any).organization;
  const filename = `${String(booking.title || 'booking').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}.pdf`;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', padding: 'clamp(24px, 5vw, 64px) 20px' }}>
      <div style={{ width: '100%', maxWidth: '720px', margin: '0 auto' }}>
        <div className="q-row q-row-between q-noprint" style={{ marginBottom: '16px' }}>
          <span className="q-meta">{studio?.name}</span>
          <div className="q-row">
            <DownloadDocumentButton href={`/booking/${params.token}/pdf`} filename={filename} />
            <PrintDocumentButton label="Print" />
          </div>
        </div>

        <BookingDocument booking={booking} />

        <p className="q-meta-sm q-noprint" style={{ textAlign: 'center', marginTop: '20px' }}>
          Questions about this? Reply to {studio?.name} directly.
        </p>
      </div>
    </div>
  );
}
