'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { stageBadgeClass, stageColor, STAGE_COLORS } from '@/components/stageBadge';
import { formatMoney } from '@/kernel/currency';
import { SheetRow, initialsFor, type SheetItem } from '@/components/Sheet';
import type { BookingsSheet, SheetBooking, LensGroup } from '@/modules/bookings/interface';

/**
 * THE DAY BOOK, AS SIMPLE DATA ANALYSIS. Every job the studio has taken,
 * with the instrument a studio needs to pull out what it wants from them:
 *
 *   narrow   - search, a date range, and one select per axis;
 *   break    - group by any axis: the bookings under headings, and above
 *              them the distribution - a segmented bar and a legend with
 *              counts and shares - of what is shown;
 *   read     - the rows, each saying where its work is and what it needs.
 *
 * The axes are the sheet's own (readBookingsSheet decides them: the bands,
 * the studio's stages, the roles steps need, money, every dimension the
 * studio classifies by). Each row says what it takes on each axis; this
 * file narrows, groups and counts, and names nothing.
 *
 * WHY ROWS IN GROUPS AND NOT A TABLE OR CARDS. A table aligns one scalar
 * down a column so the eye compares - right for money and stage, wrong
 * for a title, two packages and a list of work positions, which it would
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

const ORDERS = [
  { key: 'soon', label: 'Soonest first', compare: (a: SheetBooking, b: SheetBooking) => byDate(a, b, 1) },
  { key: 'late', label: 'Latest first', compare: (a: SheetBooking, b: SheetBooking) => byDate(a, b, -1) },
  { key: 'client', label: 'By client',
    compare: (a: SheetBooking, b: SheetBooking) => (a.clientName || '￿').localeCompare(b.clientName || '￿') || byDate(a, b, 1) },
  { key: 'title', label: 'By title', compare: (a: SheetBooking, b: SheetBooking) => (a.title || '').localeCompare(b.title || '') },
];

const NONE = '__none__';

export function BookingsDayBook({ sheet }: { sheet: BookingsSheet }) {
  /*
   * THE VIEW IS THE URL. Every control reads from the query string and
   * writes back to it, so a narrowed, grouped view can be bookmarked,
   * sent to a colleague or reached with the back button. The writes go
   * through the history API, which the router integrates with, so typing
   * in the search costs no round trip. Defaults are absent, not written.
   */
  const params = useSearchParams();
  const set = (name: string, value: string, fallback = '') => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== fallback) next.set(name, value); else next.delete(name);
    const qs = next.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  };

  const q = params.get('q') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  // Grouped by the first axis the read offers (the bands) until the operator says otherwise.
  const defaultGroup = sheet.lenses[0]?.key ?? '';
  const groupBy = params.has('group') ? params.get('group')! : defaultGroup; // 'none' = no grouping
  const order = params.get('order') ?? ORDERS[0].key;
  const chosen: Record<string, string> = {};
  for (const g of sheet.lenses) { const v = params.get(g.key); if (v) chosen[g.key] = v; }

  const all = sheet.bands.flatMap((b) => b.rows);
  const pick = (axis: string, key: string) => set(axis, key);

  // ---- Narrow: what is shown is what passes every control.
  const needle = q.trim().toLowerCase();
  const compare = ORDERS.find((o) => o.key === order)?.compare ?? ORDERS[0].compare;
  const takes = (r: SheetBooking, axis: string, key: string) =>
    key === NONE ? (r.takes[axis] ?? []).length === 0 : (r.takes[axis] ?? []).includes(key);
  /* What passes every control - or every control but one axis's select, for that axis's distribution. */
  const under = (except?: string) => all
    .filter((r) =>
      (!needle || [r.title, r.clientName, ...r.packages].some((s) => s?.toLowerCase().includes(needle))) &&
      (!from || (r.day !== null && r.day >= from)) &&
      (!to || (r.day !== null && r.day <= to)) &&
      Object.entries(chosen).every(([axis, key]) => axis === except || takes(r, axis, key)))
    .sort(compare);
  const shown = under();
  const narrowed = Boolean(needle || from || to || Object.keys(chosen).length > 0);

  // ---- Break down: the grouped axis. Its distribution is counted under the
  // other controls but not its own select, so picking one of its values
  // narrows the rows without collapsing the comparison to 100%.
  const axis: LensGroup | null = sheet.lenses.find((g) => g.key === groupBy) ?? null;
  const basis = axis ? under(axis.key) : shown;
  const breakdown = axis
    ? [
        ...axis.items.map((it, i) => ({
          key: it.key, label: it.label, note: it.note ?? null, now: Boolean(it.now), due: Boolean(it.due),
          color: it.look ? stageColor(it.look) : STAGE_COLORS[i % STAGE_COLORS.length],
          all: basis.filter((r) => takes(r, axis.key, it.key)),
        })),
        {
          key: NONE, label: axis.none ?? 'None', note: null, now: false, due: false, color: 'none',
          all: basis.filter((r) => takes(r, axis.key, NONE)),
        },
      ].filter((g) => g.all.length > 0)
        .map((g) => ({ ...g, rows: chosen[axis.key] && chosen[axis.key] !== g.key ? [] : g.all }))
    : [];
  const groups = breakdown.filter((g) => g.rows.length > 0);
  const share = (n: number) => (basis.length > 0 ? Math.round((n / basis.length) * 100) : 0);

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

  const shareVar = (n: number) => ({ '--q-share': n } as unknown as React.CSSProperties);

  return (
    <div className="q-stack q-stack-md">
      <div className="q-narrow">
        <div className="q-toolbar">
          <input
            className="q-input"
            type="search"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="Search by title, client or package"
            aria-label="Search bookings"
          />
          <span className="q-range">
            <input className="q-input" type="date" value={from} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
            <span className="q-range-dash">–</span>
            <input className="q-input" type="date" value={to} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
          </span>
          {sheet.lenses.map((g) => (
            <select
              key={g.key}
              className={chosen[g.key] ? 'q-select q-narrow-select-on' : 'q-select'}
              value={chosen[g.key] ?? ''}
              onChange={(e) => pick(g.key, e.target.value)}
              aria-label={g.label}
            >
              <option value="">{g.label}: all</option>
              {g.items.map((it) => <option key={it.key} value={it.key}>{it.label} ({it.count})</option>)}
              {g.none && <option value={NONE}>{g.none}</option>}
            </select>
          ))}
        </div>
        <div className="q-toolbar">
          <span className="q-narrow-key">Group by</span>
          <select className="q-select" value={sheet.lenses.some((g) => g.key === groupBy) ? groupBy : 'none'} onChange={(e) => set('group', e.target.value === defaultGroup ? '' : e.target.value || 'none')} aria-label="Group by">
            {sheet.lenses.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            <option value="none">No grouping</option>
          </select>
          <span className="q-narrow-key">Order</span>
          <select className="q-select" value={order} onChange={(e) => set('order', e.target.value, ORDERS[0].key)} aria-label="Order">
            {ORDERS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <span className="q-toolbar-count">{shown.length} of {all.length} booking{all.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {axis && basis.length > 0 && (
        <div className="q-dist" role="group" aria-label={`By ${axis.label.toLowerCase()}`}>
          <div className="q-dist-bar" aria-hidden="true">
            {breakdown.map((g) => (
              <span key={g.key} className={`q-dist-seg q-dist-c-${g.color}`} style={shareVar(g.all.length)} title={`${g.label}: ${g.all.length}`} />
            ))}
          </div>
          <div className="q-dist-legend">
            {breakdown.map((g) => {
              const on = chosen[axis.key] === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  className={on ? 'q-dist-key q-dist-key-on' : 'q-dist-key'}
                  aria-pressed={on}
                  onClick={() => pick(axis.key, on ? '' : g.key)}
                >
                  <i className={`q-dist-dot q-dist-c-${g.color}`} />
                  {g.label} <b>{g.all.length}</b>
                  <span className="q-dist-key-share">{share(g.all.length)}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="q-empty q-empty-lg">
          {narrowed ? 'No bookings match — widen the search, the dates or a select above.' : 'No bookings yet.'}
        </p>
      ) : axis ? (
        <div className="q-sheet">
          {groups.map((g) => (
            <React.Fragment key={g.key}>
              <div className={g.now ? 'q-sheet-band q-sheet-band-today' : 'q-sheet-band'}>
                <i className={`q-sheet-band-dot q-dist-c-${g.color}`} />
                <span className="q-sheet-band-name">{g.label}</span>
                {g.note && <span className="q-sheet-band-note">{g.note}</span>}
                <span className="q-sheet-band-count">{g.rows.length}</span>
                <span className="q-sheet-band-share">
                  <span className="q-sheet-band-bar"><i className={`q-dist-c-${g.color}`} style={shareVar(share(g.rows.length))} /></span>
                  {share(g.rows.length)}%
                </span>
              </div>
              {g.rows.map((r) => <SheetRow key={r.id} item={item(r)} />)}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className="q-sheet">
          {shown.map((r) => <SheetRow key={r.id} item={item(r)} />)}
        </div>
      )}
    </div>
  );
}
