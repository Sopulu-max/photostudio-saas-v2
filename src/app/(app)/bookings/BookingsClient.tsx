'use client';

import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';
import { formatMoney } from '@/kernel/currency';
import { CatalogFilter } from '@/components/CatalogFilter';

/**
 * Every job the studio has taken.
 *
 * WHY THIS LIST IS DIFFERENT FROM THE OTHERS. Services and packages are a
 * catalogue: a studio owns a dozen and adds one occasionally. Bookings only
 * ever grow, and a studio that is working will pass a hundred inside a year —
 * so this was always going to be the longest list in the app, and it was the
 * one with no way through at all.
 *
 * ITS FACET IS THE STAGE. A package is narrowed by what it is; a booking is
 * narrowed by where it has got to, which is the vocabulary the studio defines
 * for itself in Booking settings. Same control, same rule, different question.
 */
export function BookingsClient({
  bookings,
  currencyCode,
}: {
  bookings: any[];
  currencyCode: string;
}) {
  /*
   * The date, said the way a person says it.
   *
   * Fixed to the studio's own reading rather than the visitor's locale, because
   * a booking list read by one studio should not change shape depending on
   * whose laptop it is open on.
   */
  const when = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const Card = ({ b }: { b: any }) => {
    const date = when(b.scheduledFor);
    return (
      <Link href={`/bookings/${b.id}`} className="q-card q-card-interactive q-plain-link q-stack">
        <div className="q-row q-row-between">
          <div>
            {/*
              * The date leads, because the first thing anyone asks of a booking
              * is when it is. The list could not show one at all until now: the
              * query never asked for scheduled_for, and ordered by the moment
              * somebody opened the form instead.
              */}
            <span className="q-eyebrow">{date || 'No date set'}</span>
            <h3 className="q-card-title">{b.title}</h3>
          </div>
          {b.stage?.name && <span className={`q-badge ${stageBadgeClass(b.stage)}`}>{b.stage.name}</span>}
        </div>

        <div className="q-stack q-stack-sm">
          <div className="q-row q-row-sm">
            <span className="q-eyebrow">Client</span>
            <span className="q-meta">{b.clientName || 'Not named yet'}</span>
          </div>
          <div className="q-row q-row-sm">
            <span className="q-eyebrow">Packages</span>
            <span className="q-meta">
              {b.lineCount > 0
                ? `${b.lineCount} ${b.lineCount === 1 ? 'package' : 'packages'}`
                : 'Nothing on it yet'}
            </span>
          </div>
          <div className="q-row q-row-sm">
            <span className="q-eyebrow">Contract</span>
            <span className="q-meta">{b.hasContract ? 'Raised' : 'None'}</span>
          </div>
        </div>

        {/*
          * Money outstanding is the one thing here that is a state rather than
          * a fact, so it is the one thing that keeps a badge. Everything else
          * was a badge too, which made "2 packages" shout as loudly as an
          * unpaid balance.
          */}
        {b.pendingTotal > 0 && (
          <span className="q-badge q-badge-warning">
            {formatMoney(b.pendingTotal, b.pendingCurrency ?? currencyCode)} due
          </span>
        )}
      </Link>
    );
  };

  return (
    <CatalogFilter
      items={bookings}
      noun="booking"
      facetLabel="stage"
      read={(b: any) => ({
        name: b.title,
        description: b.clientName,
        facet: b.stage?.name ?? null,
        // A booking carries no classification of its own. It could be read
        // through the packages on it, but those are not loaded here and a
        // query per row to draw a filter would cost more than the filter saves.
        tags: [],
      })}
    >
      {(shown) => (
        <div className="q-grid-cards">
          {shown.map((b: any) => <Card key={b.id} b={b} />)}
        </div>
      )}
    </CatalogFilter>
  );
}
