'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { stageColor, STAGE_COLORS } from '@/components/stageBadge';
import { Donut, HBars } from '@/components/Charts';
import type { LensGroup, Takes } from '@/kernel/lenses';

/**
 * ANALYSIS - a sheet read as simple data analysis, the instrument a studio
 * needs to pull out what it wants from a list:
 *
 *   narrow   - search, a date range, and one select per axis;
 *   break    - group by any axis: the rows under headings, and above them
 *              the distribution - a segmented bar and a legend with counts
 *              and shares - of what is shown;
 *   graph    - the same breakdown as a donut and horizontal bars, in place
 *              of the rows (?view=graph);
 *   read     - the rows, drawn by whoever owns them: as sheet rows, or as
 *              a table with sortable columns (?view=table) when the owner
 *              says what its columns are.
 *
 * The axes arrive decided (kernel/lenses): whoever owns the rows says what
 * each row takes on each axis and what the axes are. This file narrows,
 * groups and counts, and names nothing. The bookings day book and the
 * work sheet are the same instrument over different rows.
 *
 * THE VIEW IS THE URL. Every control reads from the query string and
 * writes back to it, so a narrowed, grouped view can be bookmarked, sent
 * to a colleague or reached with the back button. The writes go through
 * the history API, which the router integrates with useSearchParams, so
 * typing in the search costs no round trip. Defaults are absent, not
 * written. Whoever renders this wraps it in the Suspense boundary the
 * hook asks for.
 */

export type AnalysisRow = { id: string; day: string | null; takes: Takes };
export type Order<R> = { key: string; label: string; compare: (a: R, b: R) => number };
/** A table column: what to call it, what to draw, and how to sort by it - the sort joins the orders. */
export type Column<R> = { key: string; label: string; cell: (r: R) => React.ReactNode; sort?: (a: R, b: R) => number; align?: 'end'; width?: string };

const NONE = '__none__';

export function Analysis<R extends AnalysisRow>({
  rows: all, lenses, orders: given, columns, searchIn, searchPlaceholder, noun, render, defaultGroup, empty, before,
}: {
  rows: R[];
  lenses: LensGroup[];
  orders: Order<R>[];
  columns?: Column<R>[];
  /** The text a row can be found by. */
  searchIn: (r: R) => (string | null | undefined)[];
  searchPlaceholder: string;
  noun: string;
  render: (r: R) => React.ReactNode;
  /** The axis grouped by until the operator says otherwise; the first axis when absent. */
  defaultGroup?: string;
  empty?: string;
  /** Drawn once above the rows in the list view - a column key for rows that share one. */
  before?: React.ReactNode;
}) {
  const params = useSearchParams();
  // A sortable column is an order too, so the header and the Order select agree.
  const orders: Order<R>[] = [
    ...given,
    ...(columns ?? []).filter((c) => c.sort && !given.some((o) => o.key === c.key)).map((c) => ({ key: c.key, label: `By ${c.label.toLowerCase()}`, compare: c.sort! })),
  ];
  const set = (name: string, value: string, fallback = '') => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== fallback) next.set(name, value); else next.delete(name);
    const qs = next.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  };

  const q = params.get('q') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const firstGroup = defaultGroup ?? lenses[0]?.key ?? '';
  const groupBy = params.has('group') ? params.get('group')! : firstGroup; // 'none' = no grouping
  const order = params.get('order') ?? orders[0].key;
  const view = params.get('view') === 'graph' ? 'graph' : params.get('view') === 'table' && columns ? 'table' : 'list';
  const desc = params.get('dir') === 'desc';
  const chosen: Record<string, string> = {};
  for (const g of lenses) { const v = params.get(g.key); if (v) chosen[g.key] = v; }

  // ---- Narrow: what is shown is what passes every control.
  const needle = q.trim().toLowerCase();
  const chosenOrder = orders.find((o) => o.key === order)?.compare ?? orders[0].compare;
  const compare = desc ? (a: R, b: R) => -chosenOrder(a, b) : chosenOrder;
  const takes = (r: R, axis: string, key: string) =>
    key === NONE ? (r.takes[axis] ?? []).length === 0 : (r.takes[axis] ?? []).includes(key);
  /* What passes every control - or every control but one axis's select, for that axis's distribution. */
  const under = (except?: string) => all
    .filter((r) =>
      (!needle || searchIn(r).some((s) => s?.toLowerCase().includes(needle))) &&
      (!from || (r.day !== null && r.day >= from)) &&
      (!to || (r.day !== null && r.day <= to)) &&
      Object.entries(chosen).every(([axis, key]) => axis === except || takes(r, axis, key)))
    .sort(compare);
  const shown = under();
  const narrowed = Boolean(needle || from || to || Object.keys(chosen).length > 0);

  // ---- Break down: the grouped axis. Its distribution is counted under the
  // other controls but not its own select, so picking one of its values
  // narrows the rows without collapsing the comparison to 100%.
  const axis: LensGroup | null = lenses.find((g) => g.key === groupBy) ?? null;
  const basis = axis ? under(axis.key) : shown;
  const breakdown = axis
    ? [
        ...axis.items.map((it, i) => ({
          key: it.key, label: it.label, note: it.note ?? null, now: Boolean(it.now),
          color: it.look ? stageColor(it.look) : STAGE_COLORS[i % STAGE_COLORS.length],
          all: basis.filter((r) => takes(r, axis.key, it.key)),
        })),
        {
          key: NONE, label: axis.none ?? 'None', note: null, now: false, color: 'none',
          all: basis.filter((r) => takes(r, axis.key, NONE)),
        },
      ].filter((g) => g.all.length > 0)
        .map((g) => ({ ...g, rows: chosen[axis.key] && chosen[axis.key] !== g.key ? [] : g.all }))
    : [];
  const groups = breakdown.filter((g) => g.rows.length > 0);
  const share = (n: number) => (basis.length > 0 ? Math.round((n / basis.length) * 100) : 0);
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
            placeholder={searchPlaceholder}
            aria-label={`Search ${noun}s`}
          />
          <span className="q-range">
            <input className="q-input" type="date" value={from} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
            <span className="q-range-dash">–</span>
            <input className="q-input" type="date" value={to} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
          </span>
          {lenses.map((g) => (
            <select
              key={g.key}
              className={chosen[g.key] ? 'q-select q-narrow-select-on' : 'q-select'}
              value={chosen[g.key] ?? ''}
              onChange={(e) => set(g.key, e.target.value)}
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
          <select
            className="q-select"
            value={axis ? axis.key : 'none'}
            onChange={(e) => set('group', e.target.value === firstGroup ? '' : e.target.value)}
            aria-label="Group by"
          >
            {lenses.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            <option value="none">No grouping</option>
          </select>
          <span className="q-narrow-key">Order</span>
          <select className="q-select" value={order} onChange={(e) => set('order', e.target.value, orders[0].key)} aria-label="Order">
            {orders.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <span className="q-toolbar-count">{shown.length} of {all.length} {noun}{all.length === 1 ? '' : 's'}</span>
          <div className="q-seg" role="group" aria-label="View">
            <button type="button" className={view === 'list' ? 'q-seg-btn q-seg-on' : 'q-seg-btn'} aria-pressed={view === 'list'} onClick={() => set('view', '')}>List</button>
            {columns && <button type="button" className={view === 'table' ? 'q-seg-btn q-seg-on' : 'q-seg-btn'} aria-pressed={view === 'table'} onClick={() => set('view', 'table')}>Table</button>}
            <button type="button" className={view === 'graph' ? 'q-seg-btn q-seg-on' : 'q-seg-btn'} aria-pressed={view === 'graph'} onClick={() => set('view', 'graph')} disabled={!axis} title={axis ? undefined : 'Group by an axis to graph it'}>Graph</button>
          </div>
        </div>
      </div>

      {axis && view === 'graph' && basis.length > 0 && (
        /* The grouped axis's breakdown drawn twice: the shape of the whole, and the values by name. Pressing a bar narrows, as the legend does. */
        <div className="q-charts" role="group" aria-label={`By ${axis.label}, as a graph`}>
          <Donut slices={breakdown.map((g) => ({ key: g.key, label: g.label, value: g.all.length, color: g.color }))} noun={noun} />
          <HBars
            slices={breakdown.map((g) => ({ key: g.key, label: g.label, value: g.all.length, color: g.color, on: chosen[axis.key] === g.key }))}
            press={(key, on) => set(axis.key, on ? '' : key)}
          />
        </div>
      )}

      {axis && view !== 'graph' && basis.length > 0 && (
        <div className="q-dist" role="group" aria-label={`By ${axis.label}`}>
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
                  onClick={() => set(axis.key, on ? '' : g.key)}
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

      {view === 'table' && columns && shown.length > 0 && (
        /*
         * THE TABLE: one scalar per column so the eye compares down it.
         * A header with a sort is a control: press it to order by that
         * column, again to reverse; the Order select says the same thing.
         * Grouping still applies - each group is a run of rows under a
         * heading row.
         */
        <div className="q-table-container q-card">
          <table className="q-table q-table-analysis">
            <thead>
              <tr>
                {columns.map((c) => {
                  const on = order === c.key;
                  return (
                    <th key={c.key} className={c.align === 'end' ? 'q-table-th q-table-th-end' : 'q-table-th'} style={c.width ? ({ width: c.width } as React.CSSProperties) : undefined} aria-sort={on ? (desc ? 'descending' : 'ascending') : undefined}>
                      {c.sort ? (
                        <button type="button" className={on ? 'q-table-sort q-table-sort-on' : 'q-table-sort'} onClick={() => { if (on) set('dir', desc ? '' : 'desc'); else { set('order', c.key, orders[0].key); } }}>
                          {c.label}<span className="q-table-sort-mark" aria-hidden="true">{on ? (desc ? '↓' : '↑') : '↕'}</span>
                        </button>
                      ) : c.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(axis ? groups : [{ key: 'all', label: '', note: null, now: false, color: 'none', all: shown, rows: shown }]).map((g) => (
                <React.Fragment key={g.key}>
                  {axis && (
                    <tr className={g.now ? 'q-table-band q-sheet-band-today' : 'q-table-band'}>
                      <td className="q-table-td" colSpan={columns.length}>
                        <span className="q-sheet-band-inline">
                          <i className={`q-sheet-band-dot q-dist-c-${g.color}`} />
                          <span className="q-sheet-band-name">{g.label}</span>
                          {g.note && <span className="q-sheet-band-note">{g.note}</span>}
                          <span className="q-sheet-band-count">{g.rows.length} · {share(g.rows.length)}%</span>
                        </span>
                      </td>
                    </tr>
                  )}
                  {g.rows.map((r) => (
                    <tr key={r.id} className="q-table-tr">
                      {columns.map((c) => <td key={c.key} className={c.align === 'end' ? 'q-table-td q-table-td-end' : 'q-table-td'}>{c.cell(r)}</td>)}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(view === 'graph' && axis) || (view === 'table' && columns && shown.length > 0) ? null : shown.length === 0 ? (
        <p className="q-empty q-empty-lg">
          {narrowed ? `No ${noun}s match — widen the search, the dates or a select above.` : (empty ?? `No ${noun}s yet.`)}
        </p>
      ) : axis ? (
        <div className="q-sheet">
          {before}
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
              {g.rows.map((r) => <React.Fragment key={r.id}>{render(r)}</React.Fragment>)}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className="q-sheet">
          {before}
          {shown.map((r) => <React.Fragment key={r.id}>{render(r)}</React.Fragment>)}
        </div>
      )}
    </div>
  );
}
