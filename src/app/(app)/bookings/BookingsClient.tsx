'use client';

import { stageBadgeClass } from '@/components/stageBadge';
import { formatMoney } from '@/kernel/currency';
import { CatalogFilter } from '@/components/CatalogFilter';
import { Sheet, initialsFor, type SheetItem } from '@/components/Sheet';
import type { BookingListRow } from '@/modules/bookings/interface';

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
function byDate(a: BookingListRow, b: BookingListRow, dir: 1 | -1) {
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
  bookings: BookingListRow[];
  currencyCode: string;
}) {
  /*
   * Soonest first is the default because it is what the query already did and
   * what a working studio asks: what is next. The others exist because the same
   * list answers other questions — everything for one client, or what has just
   * been taken.
   */
  const HOW_TO_ORDER = [
    { key: 'soon', label: 'Soonest first', compare: (a: BookingListRow, b: BookingListRow) => byDate(a, b, 1) },
    { key: 'late', label: 'Latest first', compare: (a: BookingListRow, b: BookingListRow) => byDate(a, b, -1) },
    { key: 'client', label: 'By client',
      compare: (a: BookingListRow, b: BookingListRow) =>
        (a.clientName || '￿').localeCompare(b.clientName || '￿') || byDate(a, b, 1) },
    { key: 'title', label: 'By title',
      compare: (a: BookingListRow, b: BookingListRow) => (a.title || '').localeCompare(b.title || '') },
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
   * What a booking says about itself on the sheet - as the row says it. The
   * client is named in the caption only when the title does not already lead
   * with them (the row decides). The packages are named, not counted. What
   * is owed is the one figure that needs the operator, so it takes the warm
   * colour (D3); "Nothing owed", not "Settled": an enquiry nobody has
   * invoiced has settled nothing.
   */
  const item = (b: BookingListRow): SheetItem => ({
    id: b.id,
    href: `/bookings/${b.id}`,
    name: b.title,
    caption: [
      when(b.scheduledFor),
      !b.titleNamesClient ? b.clientName : null,
      b.packages.length > 0 ? b.packages.join(' · ') : null,
    ],
    absent: b.clientName ? 'No date or package yet' : 'No date, client or package yet',
    frame: { url: b.coverUrl, initials: initialsFor(b.clientName) },
    figure: b.owed
      ? { text: formatMoney(b.owed.amount, b.owed.currency ?? currencyCode), due: true }
      : { text: 'Nothing owed', none: true },
    badge: b.stage?.name
      ? <span className={`q-badge ${stageBadgeClass(b.stage as any)}`}>{b.stage.name}</span>
      : undefined,
  });

  return (
    <CatalogFilter
      items={bookings}
      noun="booking"
      kind="catalogue"
      sorts={HOW_TO_ORDER}
      facetLabel="stage"
      views
      read={(b: BookingListRow) => ({
        name: b.title,
        description: b.clientName,
        facet: b.stage?.name ?? null,
        // What the studio understands each booking to be for - its own
        // classification, on the row - so the sheet narrows by occasion or
        // context the way the catalogue does.
        tags: b.classification,
      })}
    >
      {(shown, { dense }) => <Sheet items={shown.map(item)} dense={dense} />}
    </CatalogFilter>
  );
}
