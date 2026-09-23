'use client';

import React from 'react';
import { stageBadgeClass } from '@/components/stageBadge';
import Link from 'next/link';
import { Analysis, type Order, type Column } from '@/components/Analysis';
import { sayNeeds, sayWork, saySession, sayProgress, type Say } from '@/modules/bookings/say';
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
 * A ROW IS A STATEMENT (modules/bookings/say), the same composition the
 * summary level draws, so the two levels cannot read a booking two ways:
 * where its session is, where its work is, and what it still lacks - in
 * words, with nothing to decode. The TABLE view is where a cut is compared
 * column by column: the operator chose the cut, so a column's subject comes
 * from their own act rather than from a key (12-BOOKINGS_READABILITY §1).
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

/** The words, with the fragments that need the operator warm - the page's one drawing of a statement. */
function Said({ say }: { say: Say }) {
  return (
    <>
      {say.map((p, i) => (
        <span key={i} className={p.tone === 'warm' ? 'q-said-warm' : p.tone === 'strong' ? 'q-said-strong' : undefined}>
          {i > 0 ? ' ' : ''}{p.t}
        </span>
      ))}
    </>
  );
}

/**
 * ONE ROW: the job, then the statement its own state calls for - a session
 * ahead says when it is and who is coming; one behind with work open says
 * where the work is; anything else says what it still lacks.
 */
function Row({ b, today }: { b: SheetBooking; today: string }) {
  const held = b.day !== null && b.day < today;
  const say = b.day && !held ? saySession(b, [], today)
    : held && b.work && b.work.done < b.work.total ? sayWork(b, today)
    : sayNeeds(b, today);
  const progress = sayProgress(b);
  return (
    <Link href={`/bookings/${b.id}`} className="q-job">
      <span className="q-job-body">
        <span className="q-job-name">{b.title}</span>
        <span className="q-job-said"><Said say={say} /></span>
      </span>
      <span className="q-job-tail">
        {progress && <span className="q-job-figure">{progress}</span>}
        {b.stage && <span className={`q-badge ${stageBadgeClass(b.stage as any)}`}>{b.stage.name}</span>}
      </span>
    </Link>
  );
}

export function BookingsDayBook({ sheet }: { sheet: BookingsSheet }) {
  const all = sheet.bands.flatMap((b) => b.rows);

  const when = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  };

  /* THE TABLE: one scalar per column, so the eye compares down it. */
  const columns: Column<SheetBooking>[] = [
    { key: 'client', label: 'Client', cell: (b) => <span className="q-cell-strong">{b.clientName ?? '—'}</span>, sort: (a, b) => (a.clientName || '￿').localeCompare(b.clientName || '￿') },
    { key: 'title', label: 'Booking', cell: (b) => <Link href={`/bookings/${b.id}`} className="q-plain-link q-cell-link">{b.title}</Link>, sort: (a, b) => (a.title || '').localeCompare(b.title || '') },
    { key: 'soon', label: 'When', cell: (b) => <span className="q-cell-mono">{when(b.scheduledFor) ?? '—'}</span>, sort: (a, b) => byDate(a, b, 1) },
    { key: 'packages', label: 'Packages', cell: (b) => <span className="q-cell-quiet">{b.packages.join(' · ') || '—'}</span> },
    { key: 'stage', label: 'Status', cell: (b) => b.stage ? <span className={`q-badge ${stageBadgeClass(b.stage as any)}`}>{b.stage.name}</span> : <span className="q-cell-quiet">—</span>, sort: (a, b) => (a.stage?.name || '￿').localeCompare(b.stage?.name || '￿') },
    { key: 'steps', label: 'Steps', align: 'end', cell: (b) => b.work && b.work.total > 0 ? (
        <span className="q-cell-progress" title={`${b.work.done} of ${b.work.total} steps done`}>
          <span className="q-sheet-band-bar"><i className={b.work.done === b.work.total ? 'q-dist-c-green' : 'q-dist-c-blue'} style={{ '--q-share': Math.round((b.work.done / b.work.total) * 100) } as React.CSSProperties} /></span>
          <span className="q-cell-mono">{b.work.done}/{b.work.total}</span>
        </span>
      ) : <span className="q-cell-quiet">—</span>,
      sort: (a, b) => (a.work ? a.work.done / a.work.total : -1) - (b.work ? b.work.done / b.work.total : -1) },
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
      render={(b) => <Row b={b} today={sheet.today} />}
    />
  );
}
