'use client';

import React, { useState } from 'react';
import { stageBadgeClass } from '@/components/stageBadge';
import { formatMoney } from '@/kernel/currency';
import { CatalogFilter } from '@/components/CatalogFilter';
import { Sheet, SheetRow, initialsFor, type SheetItem } from '@/components/Sheet';
import type { BookingsSheet, SheetBooking, SheetBand, LensGroup } from '@/modules/bookings/interface';

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
 * where the work is - without breaking the alignment. Covers and the card
 * view are set aside for now; the row is named by the client's initials.
 *
 * Everything drawn here arrives decided (readBookingsSheet): the bands,
 * the work on each row, the counts. This file holds only what to show and
 * which rows the operator has asked to see.
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

const BAND_ORDER: SheetBand[] = ['today', 'tomorrow', 'week', 'later', 'undated', 'earlier', 'closed'];

export function BookingsDayBook({ sheet }: { sheet: BookingsSheet }) {
  /*
   * THE LENSES ARE THE STUDIO'S, NOT OURS. Each group is an axis of the
   * sheet - when, stage, needs, money - and its chips are the values the
   * rows actually take, with counts, read off the data by readBookingsSheet.
   * One chip per group may be pressed; groups combine. Nothing here names a
   * stage, a role or a question.
   */
  const [chosen, setChosen] = useState<Partial<Record<LensGroup['key'], string>>>({});
  const all = sheet.bands.flatMap((b) => b.rows);
  const bandOf = new Map(sheet.bands.map((b) => [b.key, b]));

  const HOW_TO_ORDER = [
    { key: 'soon', label: 'By day', compare: (a: SheetBooking, b: SheetBooking) => byDate(a, b, 1) },
    { key: 'late', label: 'Latest first', compare: (a: SheetBooking, b: SheetBooking) => byDate(a, b, -1) },
    { key: 'client', label: 'By client',
      compare: (a: SheetBooking, b: SheetBooking) => (a.clientName || '￿').localeCompare(b.clientName || '￿') || byDate(a, b, 1) },
    { key: 'title', label: 'By title', compare: (a: SheetBooking, b: SheetBooking) => (a.title || '').localeCompare(b.title || '') },
  ];

  /* Whether a row takes the chosen value on each axis - the same facts the counts were made from. */
  const takes = (r: SheetBooking, group: LensGroup['key'], key: string) => {
    switch (group) {
      case 'when': return r.band === key;
      case 'stage': return r.stage?.id === key;
      case 'needs': return r.needs.some((n) => n.id === key);
      case 'money': return key === 'uninvoiced' ? r.money === 'uninvoiced' : Boolean(r.owed && `owed:${r.owed.currency ?? sheet.currency}` === key);
    }
  };
  const items = all.filter((r) => (Object.entries(chosen) as [LensGroup['key'], string][]).every(([g, k]) => !k || takes(r, g, k)));

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

  return (
    <div className="q-stack q-stack-md">
      <div className="q-attention" role="group" aria-label="Read the sheet by">
        {sheet.lenses.map((g) => (
          <div key={g.key} className="q-attention-group">
            <span className="q-attention-axis">{g.label}</span>
            {g.items.map((it) => {
              const on = chosen[g.key] === it.key;
              return (
                <button
                  key={it.key}
                  type="button"
                  className={['q-attention-item', on ? 'q-attention-on' : '', it.due ? 'q-attention-due' : ''].filter(Boolean).join(' ')}
                  aria-pressed={on}
                  onClick={() => setChosen((c) => ({ ...c, [g.key]: on ? undefined : it.key }))}
                >
                  <span className="q-attention-fig">{it.count}</span>
                  <span className="q-attention-lab">{it.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <CatalogFilter
        items={items}
        noun="booking"
        kind="catalogue"
        sorts={HOW_TO_ORDER}
        views={false}
        denseFirst
        read={(b: SheetBooking) => ({
          name: b.title,
          description: b.clientName,
          // The stage is a lens above, not a second control here.
          facet: null,
          tags: b.classification,
        })}
      >
        {(shown, { sort }) => {
          // By day: the bands, each a heading on the sheet. Any other order:
          // one run, in that order. (Cards are set aside with the covers.)
          if (sort && sort !== 'soon') return <Sheet items={shown.map(item)} dense />;
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
