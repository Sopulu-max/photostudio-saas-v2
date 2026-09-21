'use client';

import React from 'react';
import { stageBadgeClass } from '@/components/stageBadge';
import { formatMoney } from '@/kernel/currency';
import Link from 'next/link';
import { Analysis, type Order, type Column } from '@/components/Analysis';
import { SheetRow, initialsFor, type SheetItem } from '@/components/Sheet';
import type { BookingsSheet, SheetBooking } from '@/modules/bookings/interface';

/**
 * THE DAY BOOK. Every job the studio has taken, read as simple data
 * analysis (components/Analysis): narrowed by search, dates and a select
 * per axis; grouped by any axis with its distribution above; the rows
 * under each heading. The axes are the sheet's own - the bands, the
 * studio's stages, the roles steps need, money, every dimension the
 * studio classifies by - decided in readBookingsSheet. This file says only
 * what a row looks like and how rows order.
 *
 * WHY ROWS AND NOT A TABLE OR CARDS. A table aligns one scalar down a
 * column so the eye compares - right for money and stage, wrong for a
 * title, two packages and a list of work positions, which it would
 * truncate or turn into a wall. Cards are for browsing by picture and lose
 * order. The sheet row keeps the figure and the stage in a fixed right
 * column, lets the rest flow, and carries one more line - where the work
 * is. Covers are set aside for now; the row is named by the client's
 * initials.
 */

/*
 * A booking with no date is not the soonest one. It sorts last whichever way
 * the list is pointed: a job nobody has scheduled is not an answer to "what is
 * next".
 */
function byDate(a: SheetBooking, b: SheetBooking, dir: 1 | -1) {
  const ad = a.scheduledFor, bd = b.scheduledFor;
  if (!ad && !bd) return 0;
  if (!ad) return 1;
  if (!bd) return -1;
  return String(ad).localeCompare(String(bd)) * dir;
}

const ORDERS: Order<SheetBooking>[] = [
  { key: 'soon', label: 'Soonest first', compare: (a, b) => byDate(a, b, 1) },
  { key: 'late', label: 'Latest first', compare: (a, b) => byDate(a, b, -1) },
  { key: 'client', label: 'By client', compare: (a, b) => (a.clientName || '￿').localeCompare(b.clientName || '￿') || byDate(a, b, 1) },
  { key: 'title', label: 'By title', compare: (a, b) => (a.title || '').localeCompare(b.title || '') },
];

export function BookingsDayBook({ sheet }: { sheet: BookingsSheet }) {
  const all = sheet.bands.flatMap((b) => b.rows);

  const when = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  };

  /*
   * The row: what the booking says about itself. Under the caption, where
   * its work is - each service at its first unfinished step and who is on
   * it, "nobody" in the warm colour, since that is the thing to see.
   */
  const item = (b: SheetBooking): SheetItem => ({
    id: b.id,
    href: `/bookings/${b.id}`,
    name: b.title,
    caption: [
      when(b.scheduledFor),
      !b.titleNamesClient ? b.clientName : null,
      b.packages.length > 0 ? b.packages.join(' · ') : null,
    ],
    absent: b.clientName ? 'No date or package yet' : 'No date, client or package yet',
    // No pictures on the day book, for now: the client's initials name the row.
    frame: { initials: initialsFor(b.clientName) },
    figure: b.owed
      ? { text: formatMoney(b.owed.amount, b.owed.currency ?? sheet.currency), due: true }
      : b.work && b.work.total > 0
        ? { text: b.work.done === b.work.total ? 'Work done' : `${b.work.done} of ${b.work.total} steps`, none: b.work.done !== b.work.total }
        : { text: b.billing === 'none' && b.band !== 'closed' ? 'Not invoiced' : 'Nothing owed', none: true },
    badge: b.stage?.name
      ? <span className={`q-badge ${stageBadgeClass(b.stage as any)}`}>{b.stage.name}</span>
      : undefined,
    detail: b.work && b.work.total > 0 && b.band !== 'closed' ? (
      <span className="q-work q-work-compact">
        <span className="q-work-services">
          {b.work.positions.map((p) => (
            <span key={p.service} className={p.done ? 'q-work-service q-work-done' : 'q-work-service'}>
              <span className="q-work-name">{p.service}</span>
              <span className="q-work-pos">
                {p.done ? 'Done' : <>{p.step}<span className={p.who ? 'q-work-who' : 'q-work-who q-work-gap'}> · {p.who ?? 'nobody'}</span></>}
              </span>
            </span>
          ))}
        </span>
      </span>
    ) : undefined,
    dim: b.band === 'closed',
  });

  /* THE TABLE: one scalar per column, so the eye compares down it. */
  const columns: Column<SheetBooking>[] = [
    { key: 'client', label: 'Client', cell: (b) => <span className="q-cell-strong">{b.clientName ?? '—'}</span>, sort: (a, b) => (a.clientName || '￿').localeCompare(b.clientName || '￿') },
    { key: 'title', label: 'Booking', cell: (b) => <Link href={`/bookings/${b.id}`} className="q-plain-link q-cell-link">{b.title}</Link>, sort: (a, b) => (a.title || '').localeCompare(b.title || '') },
    { key: 'soon', label: 'When', cell: (b) => <span className="q-cell-mono">{when(b.scheduledFor) ?? '—'}</span>, sort: (a, b) => byDate(a, b, 1) },
    { key: 'packages', label: 'Packages', cell: (b) => <span className="q-cell-quiet">{b.packages.join(' · ') || '—'}</span> },
    { key: 'stage', label: 'Stage', cell: (b) => b.stage ? <span className={`q-badge ${stageBadgeClass(b.stage as any)}`}>{b.stage.name}</span> : <span className="q-cell-quiet">—</span>, sort: (a, b) => (a.stage?.name || '￿').localeCompare(b.stage?.name || '￿') },
    { key: 'steps', label: 'Steps', cell: (b) => b.work && b.work.total > 0 ? (
        <span className="q-cell-progress" title={`${b.work.done} of ${b.work.total} steps done`}>
          <span className="q-sheet-band-bar"><i className={b.work.done === b.work.total ? 'q-dist-c-green' : 'q-dist-c-blue'} style={{ '--q-share': Math.round((b.work.done / b.work.total) * 100) } as React.CSSProperties} /></span>
          <span className="q-cell-mono">{b.work.done}/{b.work.total}</span>
        </span>
      ) : <span className="q-cell-quiet">—</span>,
      sort: (a, b) => (a.work ? a.work.done / a.work.total : -1) - (b.work ? b.work.done / b.work.total : -1) },
    { key: 'owed', label: 'Owed', align: 'end', cell: (b) => b.owed ? <span className="q-cell-warm q-cell-mono">{formatMoney(b.owed.amount, b.owed.currency ?? sheet.currency)}</span> : <span className="q-cell-quiet">—</span>, sort: (a, b) => (a.owed?.amount ?? 0) - (b.owed?.amount ?? 0) },
  ];

  return (
    <Analysis
      rows={all}
      lenses={sheet.lenses}
      orders={ORDERS}
      columns={columns}
      searchIn={(b) => [b.title, b.clientName, ...b.packages]}
      searchPlaceholder="Search by title, client or package"
      noun="booking"
      render={(b) => <SheetRow item={item(b)} />}
    />
  );
}
