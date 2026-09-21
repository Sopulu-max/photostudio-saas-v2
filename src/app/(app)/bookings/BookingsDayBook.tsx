'use client';

import React, { useState } from 'react';
import { stageBadgeClass } from '@/components/stageBadge';
import { formatMoney } from '@/kernel/currency';
import { CatalogFilter } from '@/components/CatalogFilter';
import { Sheet, SheetRow, initialsFor, type SheetItem } from '@/components/Sheet';
import type { BookingsSheet, SheetBooking, SheetBand } from '@/modules/bookings/interface';

/**
 * THE DAY BOOK. Every job the studio has taken, read the way a studio reads
 * its day: what is happening today and this week, where each job has got
 * to, and what needs someone.
 *
 * WHY ROWS IN BANDS AND NOT A TABLE OR CARDS. A table aligns one scalar
 * down a column so the eye compares - right for money and stage, wrong
 * for a title, two packages and a list of work positions, which it would
 * truncate or turn into a wall; and the daily question is not a comparison
 * but a reading, row by row. Cards are for browsing by picture and lose
 * the one thing a day book needs, order. The sheet row is a table whose
 * only true columns are the ones compared: the figure and the stage sit in
 * a fixed right column, the rest flows, and a row carries one more line -
 * where the work is - without breaking the alignment.
 *
 * Everything drawn here arrives decided (readBookingsSheet): the bands,
 * the work on each row, the counts. This file holds only what to show and
 * which rows the operator has asked to see.
 */

type Lens = 'today' | 'week' | 'enquiries' | 'unstaffed' | 'undated' | 'owed' | null;

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

const BAND_ORDER: SheetBand[] = ['today', 'tomorrow', 'week', 'later', 'undated', 'earlier', 'closed'];

export function BookingsDayBook({ sheet }: { sheet: BookingsSheet }) {
  const [lens, setLens] = useState<Lens>(null);
  const all = sheet.bands.flatMap((b) => b.rows);
  const bandOf = new Map(sheet.bands.map((b) => [b.key, b]));

  const HOW_TO_ORDER = [
    { key: 'soon', label: 'By day', compare: (a: SheetBooking, b: SheetBooking) => byDate(a, b, 1) },
    { key: 'late', label: 'Latest first', compare: (a: SheetBooking, b: SheetBooking) => byDate(a, b, -1) },
    { key: 'client', label: 'By client',
      compare: (a: SheetBooking, b: SheetBooking) => (a.clientName || '￿').localeCompare(b.clientName || '￿') || byDate(a, b, 1) },
    { key: 'title', label: 'By title', compare: (a: SheetBooking, b: SheetBooking) => (a.title || '').localeCompare(b.title || '') },
  ];

  /* The attention strip narrows the sheet; the same fact read as a count and as a lens. */
  const through = (rows: SheetBooking[]) => {
    switch (lens) {
      case 'today': return rows.filter((r) => r.band === 'today');
      case 'week': return rows.filter((r) => r.band === 'today' || r.band === 'tomorrow' || r.band === 'week');
      case 'enquiries': return rows.filter((r) => r.band !== 'closed' && (!r.stage || r.stage.kind === 'enquiry'));
      case 'unstaffed': return rows.filter((r) => r.band !== 'closed' && (r.work?.unstaffed ?? 0) > 0);
      case 'undated': return rows.filter((r) => r.band === 'undated');
      case 'owed': return rows.filter((r) => r.owed);
      default: return rows;
    }
  };
  const items = through(all);

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
    frame: { url: b.coverUrl, initials: initialsFor(b.clientName) },
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

  const owedSaid = sheet.attention.owed.map((o) => formatMoney(o.amount, o.currency)).join(' + ');
  const Lens = ({ id, fig, label, due, quiet }: { id: Lens; fig: string | number; label: string; due?: boolean; quiet?: boolean }) => (
    <button
      type="button"
      className={['q-attention-item', lens === id ? 'q-attention-on' : '', due ? 'q-attention-due' : '', quiet ? 'q-attention-quiet' : ''].filter(Boolean).join(' ')}
      aria-pressed={lens === id}
      onClick={() => !quiet && setLens((l) => (l === id ? null : id))}
      disabled={quiet}
    >
      <span className="q-attention-fig">{fig}</span>
      <span className="q-attention-lab">{label}</span>
    </button>
  );

  return (
    <div className="q-stack q-stack-md">
      <div className="q-attention" role="group" aria-label="What needs attention">
        <Lens id="today" fig={sheet.attention.today} label="today" quiet={sheet.attention.today === 0} />
        <Lens id="week" fig={sheet.attention.week} label="this week" quiet={sheet.attention.week === 0} />
        <Lens id="enquiries" fig={sheet.attention.enquiries} label="enquiries" quiet={sheet.attention.enquiries === 0} />
        <Lens id="unstaffed" fig={sheet.attention.unstaffed} label="nobody on a step" due={sheet.attention.unstaffed > 0} quiet={sheet.attention.unstaffed === 0} />
        <Lens id="undated" fig={sheet.attention.undated} label="no date yet" quiet={sheet.attention.undated === 0} />
        <Lens id="owed" fig={owedSaid || '0'} label="owed" due={sheet.attention.owed.length > 0} quiet={sheet.attention.owed.length === 0} />
      </div>

      <CatalogFilter
        items={items}
        noun="booking"
        kind="catalogue"
        sorts={HOW_TO_ORDER}
        facetLabel="stage"
        views
        denseFirst
        read={(b: SheetBooking) => ({
          name: b.title,
          description: b.clientName,
          facet: b.stage?.name ?? null,
          tags: b.classification,
        })}
      >
        {(shown, { dense, sort }) => {
          // By day: the bands, each a heading on the sheet. Any other order,
          // or the cards: one run, in that order.
          if (!dense || (sort && sort !== 'soon')) return <Sheet items={shown.map(item)} dense={dense} />;
          const shownIds = new Set(shown.map((b) => b.id));
          return (
            <div className="q-sheet">
              {BAND_ORDER.map((key) => {
                const band = bandOf.get(key);
                const rows = (band?.rows || []).filter((r) => shownIds.has(r.id));
                if (rows.length === 0) return null;
                return (
                  <React.Fragment key={key}>
                    <div className={key === 'today' ? 'q-sheet-band q-sheet-band-today' : 'q-sheet-band'}>
                      <span className="q-sheet-band-name">{band!.label}</span>
                      {band!.note && <span className="q-sheet-band-note">{band!.note}</span>}
                      <span className="q-sheet-band-count">{rows.length}</span>
                    </div>
                    {rows.map((r) => <SheetRow key={r.id} item={item(r)} />)}
                  </React.Fragment>
                );
              })}
            </div>
          );
        }}
      </CatalogFilter>
    </div>
  );
}
