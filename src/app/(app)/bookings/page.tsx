import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listBookings } from '@/modules/bookings/interface';
import { getStudio, getStudioCurrency } from '@/kernel/organizations';
import { StorefrontLink } from '../packages/StorefrontLink';
import { BookingsClient } from './BookingsClient';

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
  const [bookings, currencyCode, org] = await Promise.all([
    listBookings(), getStudioCurrency(), getStudio(),
  ]);

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">Every job, wherever it is. Start one with whatever you know — the rest fills in as you go.</p>
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

      {(!bookings || bookings.length === 0) ? (
        <div className="q-card q-empty-lg q-stack">
          <h3 className="q-section-title">No bookings yet</h3>
          <p className="q-meta">Start one from just a title — the details fill in as they come.</p>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      ) : (
        <BookingsClient bookings={bookings} currencyCode={currencyCode} />
      )}
      </div>
    </div>
  );
}
