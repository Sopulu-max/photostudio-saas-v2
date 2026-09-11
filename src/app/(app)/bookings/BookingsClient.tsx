'use client';

import { stageBadgeClass } from '@/components/stageBadge';
import { formatMoney } from '@/kernel/currency';
import { CatalogFilter } from '@/components/CatalogFilter';
import { Sheet, initialsFor, type SheetItem } from '@/components/Sheet';

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
 * Drawn by the shared Sheet (D1, D4, D7): this file says what a booking says
 * about itself, and nothing about how a row or a tile is built.
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
   * The date, said the way a person says it. Fixed to the studio's own reading
   * rather than the visitor's locale, because a booking list read by one
   * studio should not change shape depending on whose laptop it is open on.
   */
  const when = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /*
   * What a booking says about itself on the sheet.
   *
   * The client is named in the caption only when the title does not already
   * lead with them: a composed title reads "Pius James — Custom Enquiry", and
   * a caption that then says "Pius James" again is the same name twice on a
   * two-line row. The contract fact is not on the row at all — raised or not,
   * it is a consequence that never asks (D5), and it is on the booking.
   *
   * What is owed is the one figure that needs the operator, so it is the one
   * that takes the warm colour (D3). "Nothing owed", not "Settled": an enquiry
   * nobody has invoiced has settled nothing.
   */
  const item = (b: any): SheetItem => {
    const titleNamesClient = Boolean(
      b.clientName && String(b.title || '').toLowerCase().includes(String(b.clientName).toLowerCase()),
    );
    return {
      id: b.id,
      href: `/bookings/${b.id}`,
      name: b.title,
      caption: [
        when(b.scheduledFor),
        !titleNamesClient ? b.clientName : null,
        b.lineCount > 0 ? `${b.lineCount} ${b.lineCount === 1 ? 'package' : 'packages'}` : null,
      ],
      absent: b.clientName ? 'No date or package yet' : 'No date, client or package yet',
      frame: { url: b.coverUrl, initials: initialsFor(b.clientName) },
      figure: b.pendingTotal > 0
        ? { text: formatMoney(b.pendingTotal, b.pendingCurrency ?? currencyCode), due: true }
        : { text: 'Nothing owed', none: true },
      badge: b.stage?.name
        ? <span className={`q-badge ${stageBadgeClass(b.stage)}`}>{b.stage.name}</span>
        : undefined,
    };
  };

  return (
    <CatalogFilter
      items={bookings}
      noun="booking"
      kind="catalogue"
      sorts={HOW_TO_ORDER}
      facetLabel="stage"
      views
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
      {(shown, { dense }) => <Sheet items={shown.map(item)} dense={dense} />}
    </CatalogFilter>
  );
}
