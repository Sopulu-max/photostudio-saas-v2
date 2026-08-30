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
          <div className="q-fill">
            {/* The date leads the card, because the first thing anyone asks of
                a booking is when it is. */}
            <span className={date ? 'q-eyebrow' : 'q-eyebrow q-absent'}>{date || 'No date set'}</span>
            <h3 className="q-card-title">{b.title}</h3>
          </div>
          {b.stage?.name && <span className={`q-badge ${stageBadgeClass(b.stage)}`}>{b.stage.name}</span>}
        </div>

        {/* Who it is for: the answer somebody opened the list to find, in the
            same place the other two catalogues put theirs. */}
        <p className={b.clientName ? 'q-lead' : 'q-lead q-absent'}>
          {b.clientName || 'No client named yet'}
        </p>

        <div className="q-facts">
          <span className="q-fact-group">
            <span className="q-fact-key">Packages</span>
            <span className={b.lineCount > 0 ? 'q-fact' : 'q-fact q-absent'}>
              {b.lineCount > 0 ? b.lineCount : 'None'}
            </span>
          </span>
          <span className="q-fact-group">
            <span className="q-fact-key">Contract</span>
            <span className={b.hasContract ? 'q-fact' : 'q-fact q-absent'}>
              {b.hasContract ? 'Raised' : 'None'}
            </span>
          </span>
        </div>

        {/* The money band. Outstanding takes the price treatment because it is
            the number an operator scans a booking list for; nothing owed is a
            quiet statement rather than a figure. */}
        <div className="q-card-foot">
          {b.pendingTotal > 0 ? (
            <>
              <span className="q-price">
                {formatMoney(b.pendingTotal, b.pendingCurrency ?? currencyCode)}
              </span>
              <span className="q-meta-sm">outstanding</span>
            </>
          ) : (
            <span className="q-meta-sm q-absent">Nothing outstanding</span>
          )}
        </div>
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
