'use client';

import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';
import { formatMoney } from '@/kernel/currency';
import { CatalogFilter } from '@/components/CatalogFilter';

/**
 * Every job the studio has taken, as a sheet.
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
 *
 * A SHEET, NOT A GRID OF CARDS (D1). It was a card per booking — title, lead,
 * a facts strip, a money band — which is the print treatment applied to a
 * list: thirty separate objects, each asking to be looked at, on a screen
 * whose whole job is to be scanned past. A row is a hairline and a frame.
 *
 * THE FRAME LEADS EVERY ROW (D4). bookings.cover_url has existed since
 * 20261010 and this list never showed it. When there is no photograph the
 * client's initials fill the same frame, so the column never goes missing.
 */

/*
 * A booking with no date is not the soonest one. It sorts last whichever way
 * the list is pointed, for the same reason an unpriced package does: a job
 * nobody has scheduled is not an answer to "what is next".
 */
function byDate(a: any, b: any, dir: 1 | -1) {
  const ad = a.scheduledFor, bd = b.scheduledFor;
  if (!ad && !bd) return 0;
  if (!ad) return 1;
  if (!bd) return -1;
  return String(ad).localeCompare(String(bd)) * dir;
}

/* The same reading ContactAvatar makes of a person: two letters, or one. */
function initialsFor(name: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function BookingsClient({
  bookings,
  currencyCode,
}: {
  bookings: any[];
  currencyCode: string;
}) {
  /*
   * Soonest first is the default because it is what the query already did and
   * what a working studio asks: what is next. The others exist because the same
   * list answers other questions — everything for one client, or what has just
   * been taken.
   */
  const HOW_TO_ORDER = [
    { key: 'soon', label: 'Soonest first', compare: (a: any, b: any) => byDate(a, b, 1) },
    { key: 'late', label: 'Latest first', compare: (a: any, b: any) => byDate(a, b, -1) },
    { key: 'client', label: 'By client',
      compare: (a: any, b: any) =>
        (a.clientName || '￿').localeCompare(b.clientName || '￿') || byDate(a, b, 1) },
    { key: 'title', label: 'By title',
      compare: (a: any, b: any) => (a.title || '').localeCompare(b.title || '') },
  ];
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

  /*
   * One row. Frame, two lines, a figure. Everything the old card said is still
   * here — date, title, client, stage, packages, what is owed — in the order a
   * person scanning for a job actually reads it, and in a fifth of the height.
   *
   * The contract fact is gone from the row: "Raised" or "None" is a consequence
   * that never asks anything on a sheet (D5), and it is on the booking.
   */
  const Row = ({ b }: { b: any }) => {
    const date = when(b.scheduledFor);
    /*
     * The client is named in the caption only when the title does not
     * already lead with them. A composed title reads "Pius James — Custom
     * Enquiry", and a caption that then says "Pius James" again is the same
     * name twice on a two-line row — repetition reads as noise before it
     * reads as anything.
     */
    const titleNamesClient = Boolean(
      b.clientName && String(b.title || '').toLowerCase().includes(String(b.clientName).toLowerCase()),
    );
    const caption = [
      date ?? null,
      !titleNamesClient ? (b.clientName ?? null) : null,
      b.lineCount > 0 ? `${b.lineCount} ${b.lineCount === 1 ? 'package' : 'packages'}` : null,
    ].filter(Boolean);

    return (
      <Link href={`/bookings/${b.id}`} className="q-sheet-row">
        <span className="q-sheet-frame" aria-hidden="true">
          {b.coverUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={b.coverUrl} alt="" />
            : initialsFor(b.clientName)}
        </span>

        <span className="q-sheet-body">
          <span className="q-sheet-name">{b.title}</span>
          <span className="q-sheet-cap">
            {caption.length > 0
              ? caption.join(' · ')
              /* Only what is actually missing. A client whose name was left
                 out of the caption because the title already says it is not
                 an absent client, and this line must not claim one. */
              : <span className="q-absent">
                  {b.clientName ? 'No date or package yet' : 'No date, client or package yet'}
                </span>}
          </span>
        </span>

        <span className="q-sheet-side">
          {/* What is owed is the one figure on this sheet that needs the
              operator, so it is the one that takes the amber (D3). */}
          {b.pendingTotal > 0
            ? <span className="q-sheet-fig q-sheet-fig-due">{formatMoney(b.pendingTotal, b.pendingCurrency ?? currencyCode)}</span>
            /* "Nothing owed", not "Settled": an enquiry nobody has invoiced
               has settled nothing, and the row must not say it has. */
            : <span className="q-sheet-fig q-sheet-fig-none">Nothing owed</span>}
          {b.stage?.name && (
            <span className={`q-badge ${stageBadgeClass(b.stage)}`}>{b.stage.name}</span>
          )}
        </span>
      </Link>
    );
  };

  return (
    <CatalogFilter
      items={bookings}
      noun="booking"
      kind="catalogue"
      sorts={HOW_TO_ORDER}
      facetLabel="stage"
      /* A sheet has one form. Offering Cards would be offering a control
         that does nothing, which is exactly what this flag exists to refuse. */
      views={false}
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
        <div className="q-sheet">
          {shown.map((b: any) => <Row key={b.id} b={b} />)}
        </div>
      )}
    </CatalogFilter>
  );
}
