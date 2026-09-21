import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { readBookingsSheet } from '@/modules/bookings/interface';
import { getStudio } from '@/kernel/organizations';
import { StorefrontLink } from '../packages/StorefrontLink';
import { Suspense } from 'react';
import { BookingsDayBook } from './BookingsDayBook';

export const dynamic = 'force-dynamic';


export default async function BookingsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  /*
   * Everything here comes through a module interface — this surface owns no
   * queries.
   *
   * It used to load every client and every package as well, shape both into
   * option lists, and then render neither: a form that once stood on this page
   * had gone, and its data went on being fetched. listPackages is the heavy
   * nested read behind the whole packages catalogue, so every visit to
   * Bookings was paying for the entire package graph in order to discard it.
   */
  // One read, decided: the bands, the work on each row, what needs someone.
  const [sheet, org] = await Promise.all([readBookingsSheet(), getStudio()]);

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">Every job by the day it happens, where each has got to, and what needs someone.</p>
        </div>
        <div className="q-row">
          {/* Named for what it holds, like every other header link. */}
          <Link href="/bookings/settings" className="q-btn q-btn-secondary">Stages</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
      {/* Public booking link — always visible so the studio can share it */}
      {org?.slug && (
        <div className="q-card q-row q-row-between">
          <div>
            <div className="q-strong">Public booking link</div>
            <div className="q-meta">Share this link so clients can book directly.</div>
          </div>
          <StorefrontLink slug={org.slug} path={`/book/${org.slug}/custom`} />
        </div>
      )}

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
    </div>
  );
}
