import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { readBookingsSheet } from '@/modules/bookings/interface';
import { BookingsDayBook } from '../BookingsDayBook';

export const dynamic = 'force-dynamic';

/**
 * ALL BOOKINGS - the day book. Every booking, narrowed, grouped and read
 * (BookingsDayBook over components/Analysis). The dashboard's doors open
 * this page on one question - ?when=undated, ?stage=<id> - and the view
 * is the URL, so a reading can be kept or sent.
 */
export default async function AllBookingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const sheet = await readBookingsSheet();

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">All bookings</h1>
          <p className="q-page-subtitle">Every job, by any question: narrow, group, read.</p>
        </div>
        <div className="q-row q-row-sm">
          <Link href="/bookings" className="q-btn q-btn-secondary">Dashboard</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      </header>

      {sheet.bands.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <h3 className="q-section-title">No bookings yet</h3>
          <p className="q-meta">Start one from just a title — the details fill in as they come.</p>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      ) : (
        // The day book reads its view from the URL; the boundary is what useSearchParams asks for.
        <Suspense fallback={null}>
          <BookingsDayBook sheet={sheet} />
        </Suspense>
      )}
    </div>
  );
}
