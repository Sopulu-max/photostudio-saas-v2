'use client';

import React from 'react';
import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';
import { cardNeeds, sayDay, plural } from '@/modules/bookings/say';
import type { LensGroup } from '@/kernel/lenses';
import type { RegisterRow } from '@/modules/bookings/interface';

/**
 * THE REGISTER - the table view of the book.
 *
 * Every booking a row, every fact from the inventory a column, and three verbs
 * only: narrow, group, sort. The columns are declared HERE, in the client,
 * because a column is a way of drawing a fact and the page may not hand
 * functions across the server boundary; every one of them reads a fact the
 * module already decided (modules/bookings/register), so nothing is derived
 * twice. The axes it narrows and groups by are the studio's own, read off the
 * rows (kernel/lenses) - a new stage, role or dimension appears with no change
 * here.
 *
 * THE URL HOLDS THE STATE: the cut, the grouping and the sort. So a cut is a
 * link, the back button works, and the figures in the dashboard above are
 * ordinary links that narrow this table instead of navigating away from it.
 *
 * Subtotals sit on the group heading; the totals row sums each column OVER THE
 * CUT, not over the book - with fifteen rows shown, "44 edited photographs" is
 * what those fifteen owe.
 */

type Query = Record<string, string | undefined>;

type Column = {
  key: string;
  label: string;
  width: number;
  align?: 'right';
  cell: (r: RegisterRow, today: string, now: number) => React.ReactNode;
  total?: (rows: RegisterRow[]) => React.ReactNode;
};

const SORTS: { key: string; label: string; compare: (a: RegisterRow, b: RegisterRow) => number }[] = [
  { key: 'oldest', label: 'Oldest first', compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
  { key: 'newest', label: 'Newest first', compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  { key: 'soonest', label: 'Session soonest', compare: (a, b) => (a.scheduledFor ?? '￿').localeCompare(b.scheduledFor ?? '￿') },
  { key: 'client', label: 'By client', compare: (a, b) => (a.clientName ?? '￿').localeCompare(b.clientName ?? '￿') },
  { key: 'activity', label: 'Last moved', compare: (a, b) => (b.lastActivity?.at ?? '').localeCompare(a.lastActivity?.at ?? '') },
];

const ago = (iso: string, now: number) => {
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

/** A commitment, said: what is owed, what was added as an extra, and whether a number was left open. */
const saidCommitted = (c: { quantity: number; extra: number; undecided: boolean }) =>
  `${c.quantity + c.extra}${c.extra > 0 ? ` (+${c.extra})` : ''}${c.undecided ? ' +?' : ''}`;

const COLUMNS: Column[] = [
  { key: 'client', label: 'Client', width: 140,
    cell: (r) => <span className="q-reg-strong">{r.clientName ?? <span className="q-reg-none">No client</span>}</span> },
  { key: 'package', label: 'Package', width: 208,
    cell: (r) => r.packages.length > 0
      ? <span title={r.packages.join(' · ')}>{r.packages.join(' · ')}</span>
      : <span className="q-reg-none">No package</span> },
  { key: 'stage', label: 'Stage', width: 100,
    cell: (r) => r.stage
      ? <span className={`q-badge ${stageBadgeClass(r.stage as any)}`}>{r.stage.name}</span>
      : <span className="q-reg-none">Not set</span> },
  { key: 'session', label: 'Session', width: 158,
    cell: (r, today) => r.day
      ? <span className={r.day === today ? 'q-reg-mono q-reg-now' : r.day < today ? 'q-reg-mono q-reg-warm' : 'q-reg-mono'}>{sayDay(r.day, today)}</span>
      : <span className="q-reg-none">Not scheduled</span>,
    total: (rs) => {
      const none = rs.filter((r) => !r.day).length;
      return none > 0 ? <span className="q-reg-warm">{none} not scheduled</span> : null;
    } },
  { key: 'decision', label: 'Decision', width: 108,
    cell: (r) => r.hasContract && !r.proposalOut ? <span>Agreed</span>
      : r.proposalOut ? <span>Issued</span>
      : <span className="q-reg-warm">None issued</span>,
    total: (rs) => {
      const issued = rs.filter((r) => r.proposalOut).length;
      return issued > 0 ? <span>{issued} issued</span> : null;
    } },
  { key: 'personnel', label: 'Personnel', width: 150,
    cell: (r) => r.personnel.length > 0
      ? <span title={r.personnel.join(' · ')}>{r.personnel.join(' · ')}</span>
      : <span className="q-reg-warm">Nobody assigned</span>,
    total: (rs) => {
      const short = rs.filter((r) => r.personnel.length === 0).length;
      return short > 0 ? <span className="q-reg-warm">{short} unassigned</span> : null;
    } },
  { key: 'steps', label: 'Steps', width: 104,
    cell: (r) => r.work && r.work.total > 0
      ? <span className="q-reg-steps" title={`${r.work.done} of ${r.work.total} steps done`}>
          <span className="q-reg-track">
            <i className={r.work.done === r.work.total ? 'q-reg-fill q-reg-fill-done' : 'q-reg-fill'}
               style={{ '--q-share': Math.round((r.work.done / r.work.total) * 100) } as React.CSSProperties} />
          </span>
          <span className="q-reg-mono">{r.work.done}/{r.work.total}</span>
        </span>
      : <span className="q-reg-none">—</span>,
    total: (rs) => {
      const done = rs.reduce((n, r) => n + (r.work?.done ?? 0), 0);
      const all = rs.reduce((n, r) => n + (r.work?.total ?? 0), 0);
      return all > 0 ? <span>{done} of {all} done</span> : null;
    } },
  { key: 'committed', label: 'Committed', width: 150,
    cell: (r) => {
      if (r.committed.length === 0) return <span className="q-reg-none">—</span>;
      const said = r.committed.map((c) => `${saidCommitted(c)} ${c.deliverable}`).join(' · ');
      return <span title={said}>{said}</span>;
    },
    total: (rs) => {
      const sum = new Map<string, number>();
      for (const r of rs) for (const c of r.committed) sum.set(c.deliverable, (sum.get(c.deliverable) ?? 0) + c.quantity + c.extra);
      const top = [...sum.entries()].sort((a, b) => b[1] - a[1])[0];
      return top ? <span>{top[1]} {top[0].toLowerCase()}</span> : null;
    } },
  { key: 'for', label: 'For', width: 140,
    cell: (r) => r.classification.length > 0
      ? <span>{r.classification.map((c) => c.valueName).join(' · ')}</span>
      : <span className="q-reg-none">Not stated</span>,
    total: (rs) => {
      const none = rs.filter((r) => r.classification.length === 0).length;
      return none > 0 ? <span>{none} not stated</span> : null;
    } },
  { key: 'outstanding', label: 'Outstanding', width: 150,
    cell: (r) => {
      const need = cardNeeds(r);
      return need ? <span className="q-reg-warm">{need}</span> : <span className="q-reg-none">Nothing</span>;
    },
    total: (rs) => {
      const n = rs.filter((r) => cardNeeds(r)).length;
      return n > 0 ? <span className="q-reg-warm">{n} outstanding</span> : null;
    } },
  { key: 'age', label: 'Age', width: 60, align: 'right',
    cell: (r, _today, now) => <span className="q-reg-mono">{ago(r.createdAt, now)}</span> },
  { key: 'activity', label: 'Last moved', width: 96, align: 'right',
    cell: (r, _today, now) => r.lastActivity
      ? <span className="q-reg-mono" title={`${r.lastActivity.action.replace(/_/g, ' ')} · ${new Date(r.lastActivity.at).toLocaleString('en-GB')}`}>{ago(r.lastActivity.at, now)} ago</span>
      : <span className="q-reg-none">—</span> },
];

export function Register({ rows, lenses, q, today, views }: {
  rows: RegisterRow[];
  lenses: LensGroup[];
  q: Query;
  today: string;
  views: { key: string; label: string; count: number; href: string; on: boolean }[];
}) {
  const [search, setSearch] = React.useState('');
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const now = React.useMemo(() => Date.now(), []);

  /** One URL shape for every control here: patch what changes, keep the rest. */
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return `/bookings${s ? `?${s}` : ''}`;
  };

  const cuts = lenses
    .map((g) => ({ g, value: q[g.key] }))
    .filter((x): x is { g: LensGroup; value: string } => Boolean(x.value));

  const narrowed = rows.filter((r) => {
    for (const { g, value } of cuts) {
      const takes = r.takes[g.key] ?? [];
      if (value === '__none__' ? takes.length > 0 : !takes.includes(value)) return false;
    }
    if (search.trim()) {
      const hay = [r.title, r.clientName, ...r.packages, ...r.personnel].join(' ').toLowerCase();
      if (!hay.includes(search.trim().toLowerCase())) return false;
    }
    return true;
  });

  const sort = SORTS.find((s) => s.key === q.sort) ?? SORTS[0];
  const ordered = [...narrowed].sort(sort.compare);

  const groupBy = q.group ? lenses.find((g) => g.key === q.group) ?? null : null;
  const groups = groupBy
    ? [
        ...groupBy.items.map((it) => ({
          key: it.key, label: it.label, look: it.look ?? null,
          rows: ordered.filter((r) => (r.takes[groupBy.key] ?? []).includes(it.key)),
        })),
        ...(groupBy.none ? [{
          key: '__none__', label: groupBy.none, look: null,
          rows: ordered.filter((r) => (r.takes[groupBy.key] ?? []).length === 0),
        }] : []),
      ].filter((g) => g.rows.length > 0)
    : [{ key: 'all', label: '', look: null, rows: ordered }];

  const grid = { gridTemplateColumns: COLUMNS.map((c) => `${c.width}px`).join(' ') } as React.CSSProperties;
  const width = COLUMNS.reduce((n, c) => n + c.width, 0) + COLUMNS.length * 12 + 32;

  const menu = (key: string, label: string, items: { label: string; href: string; on: boolean }[]) => (
    <span className="q-reg-menu">
      <button type="button" className={openMenu === key ? 'q-reg-btn q-reg-btn-open' : 'q-reg-btn'}
              onClick={() => setOpenMenu(openMenu === key ? null : key)} aria-expanded={openMenu === key}>
        {label}<i className="q-reg-caret" aria-hidden="true">▾</i>
      </button>
      {openMenu === key && (
        <span className="q-reg-pop">
          {items.map((it) => (
            <Link key={it.href + it.label} href={it.href} className={it.on ? 'q-reg-pop-item q-reg-pop-on' : 'q-reg-pop-item'}
                  onClick={() => setOpenMenu(null)}>
              {it.label}
            </Link>
          ))}
        </span>
      )}
    </span>
  );

  return (
    <section className="q-reg">
      <div className="q-reg-views">
        {views.map((v) => (
          <Link key={v.key} href={v.href} className={v.on ? 'q-reg-view q-reg-view-on' : 'q-reg-view'}>
            {v.label}<b>{v.count}</b>
          </Link>
        ))}
      </div>

      <div className="q-reg-bar">
        <input className="q-reg-search" value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Search client, package, personnel" aria-label="Search the register" />
        {cuts.map(({ g, value }) => (
          <Link key={g.key} href={href({ [g.key]: null })} className="q-reg-chip">
            <span>{g.label}</span>
            <b>{value === '__none__' ? g.none ?? 'None' : g.items.find((i) => i.key === value)?.label ?? value}</b>
            <i aria-hidden="true">×</i>
          </Link>
        ))}
        {menu('filter', 'Filter', lenses.flatMap((g) => [
          ...g.items.map((it) => ({ label: `${g.label}: ${it.label} (${it.count})`, href: href({ [g.key]: it.key }), on: q[g.key] === it.key })),
          ...(g.none ? [{ label: `${g.label}: ${g.none}`, href: href({ [g.key]: '__none__' }), on: q[g.key] === '__none__' }] : []),
        ]))}
        {menu('group', groupBy ? `Group: ${groupBy.label}` : 'Group', [
          { label: 'No grouping', href: href({ group: null }), on: !groupBy },
          ...lenses.map((g) => ({ label: g.label, href: href({ group: g.key }), on: q.group === g.key })),
        ])}
        {menu('sort', `Sort: ${sort.label}`, SORTS.map((s) => ({
          label: s.label, href: href({ sort: s.key === 'oldest' ? null : s.key }), on: sort.key === s.key,
        })))}
        <span className="q-reg-count">
          {ordered.length === rows.length ? plural(rows.length, 'booking') : `${ordered.length} of ${plural(rows.length, 'booking')}`}
        </span>
      </div>

      <div className="q-reg-scroll">
        <div style={{ minWidth: `${width}px` }}>
          <div className="q-reg-head" style={grid}>
            {COLUMNS.map((c) => (
              <span key={c.key} className={c.align === 'right' ? 'q-reg-h q-reg-right' : 'q-reg-h'}>{c.label}</span>
            ))}
          </div>

          {groups.map((g) => (
            <React.Fragment key={g.key}>
              {groupBy && (
                <div className="q-reg-group">
                  {g.look?.color && <i className={`q-reg-dot q-dist-c-${g.look.color}`} />}
                  <span className="q-reg-group-name">{g.label}</span>
                  <span className="q-reg-group-n">{plural(g.rows.length, 'booking')}</span>
                  {COLUMNS.filter((c) => c.total).map((c) => {
                    const t = c.total!(g.rows);
                    return t ? <span key={c.key} className="q-reg-group-sum">{t}</span> : null;
                  })}
                </div>
              )}
              {g.rows.map((r) => (
                <Link key={r.id} href={`/bookings/${r.id}`} className="q-reg-row" style={grid}>
                  {COLUMNS.map((c) => (
                    <span key={c.key} className={c.align === 'right' ? 'q-reg-cell q-reg-right' : 'q-reg-cell'}>
                      {c.cell(r, today, now)}
                    </span>
                  ))}
                </Link>
              ))}
            </React.Fragment>
          ))}

          {ordered.length === 0 ? (
            <p className="q-reg-empty">No booking answers this cut. Remove a filter above to widen it.</p>
          ) : (
            <div className="q-reg-totals" style={grid}>
              {COLUMNS.map((c, i) => (
                <span key={c.key} className={c.align === 'right' ? 'q-reg-total q-reg-right' : 'q-reg-total'}>
                  {c.total ? c.total(ordered) : i === 0 ? plural(ordered.length, 'booking') : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
