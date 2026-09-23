'use client';

import React from 'react';
import Link from 'next/link';
import type { LensGroup } from '@/kernel/lenses';
import type { RegisterRow, Figure } from '@/modules/bookings/interface';
import { datedFrom } from '@/modules/bookings/dated';
import type { BookingsMonth } from '@/modules/bookings/month';
import { cardName, cardWhat, cardWhen, cardNeeds } from '@/modules/bookings/say';
import { Board, type BoardCard } from '@/components/Board';
import { Register } from './Register';
import { Outstanding, Calendar, Distribution } from './Views';
import { monthFrame } from './actions';

/**
 * THE WORKSPACE - why the bookings page stops behaving like a website.
 *
 * Every reading of this page used to be a navigation. Switching a tab, setting
 * a cut, grouping, sorting, typing in the search box: each one was a link, each
 * link re-ran the whole server render, and each render read the book again -
 * measured between 1.3 and 8.6 seconds of application code to show data the
 * browser already had. Nothing about the data had changed; only the question
 * being asked of it.
 *
 * So the rows arrive ONCE, with the page, and every one of those readings
 * happens here, in the browser, at no cost. What that buys, precisely:
 *
 *   the tabs        instant - the same rows, drawn another way
 *   the cut         instant - a filter over rows already in hand
 *   group and sort  instant - the register's own ordering
 *   the search      instant, as it is typed
 *
 * THE URL STILL HOLDS THE STATE, by replaceState rather than navigation, so a
 * reading is still a link, the back button still works, and a reload comes
 * back to the same view. The same pattern the sheet already used
 * (components/Analysis).
 *
 * WHAT STILL ASKS THE SERVER, and should: moving to another month. The
 * calendar's days are the studio's own - Sundays from 13:00, the last Saturday
 * from 10:00 - and those hours are resolved in the database so that the
 * precedence between a named date, an nth weekday and the ordinary week is
 * written once. That is a real new fact, so it is fetched (one small action,
 * not a page load) rather than guessed at here.
 */

type View = 'register' | 'outstanding' | 'calendar' | 'board' | 'distribution';
const VIEWS: { key: View; label: string }[] = [
  { key: 'register', label: 'Register' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'board', label: 'Board' },
  { key: 'distribution', label: 'Distribution' },
];

export function Workspace({
  rows, lenses, today, figures, months, series, periodDays, month: firstMonth, initial,
}: {
  rows: RegisterRow[];
  lenses: LensGroup[];
  today: string;
  figures: Figure[];
  months: string[];
  series: { key: string; label: string; points: number[] }[];
  periodDays: number;
  month: BookingsMonth;
  /** What the URL asked for on the way in, so a link opens on the right reading. */
  initial: Record<string, string | undefined>;
}) {
  const [view, setView] = React.useState<View>(
    (VIEWS.find((v) => v.key === initial.view)?.key ?? 'register') as View,
  );
  const [cut, setCut] = React.useState<Record<string, string>>(() => {
    const from: Record<string, string> = {};
    for (const g of lenses) if (initial[g.key]) from[g.key] = initial[g.key]!;
    return from;
  });
  const [group, setGroup] = React.useState<string | null>(initial.group ?? null);
  const [sort, setSort] = React.useState<string>(initial.sort ?? 'oldest');
  const [boardAxisKey, setBoardAxisKey] = React.useState<string>(initial.board ?? 'stage');
  const [month, setMonth] = React.useState<BookingsMonth>(firstMonth);
  const [monthBusy, setMonthBusy] = React.useState(false);

  /** The URL mirrors the reading, without navigating to it. */
  React.useEffect(() => {
    const p = new URLSearchParams();
    if (view !== 'register') p.set('view', view);
    for (const [k, v] of Object.entries(cut)) if (v) p.set(k, v);
    if (group) p.set('group', group);
    if (sort !== 'oldest') p.set('sort', sort);
    if (boardAxisKey !== 'stage') p.set('board', boardAxisKey);
    if (month.month !== firstMonth.month) p.set('month', month.month);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [view, cut, group, sort, boardAxisKey, month.month, firstMonth.month]);

  // ---- THE CUT, applied here, over rows already in hand.
  const inCut = React.useMemo(() => rows.filter((r) =>
    Object.entries(cut).every(([key, value]) => {
      const takes = r.takes[key] ?? [];
      if (value === '__none__') return takes.length === 0;
      if (value === '__any__') return takes.length > 0;
      return takes.includes(value);
    })), [rows, cut]);
  const live = React.useMemo(() => inCut.filter((r) => r.band !== 'closed'), [inCut]);

  const narrow = (key: string, value: string | null) =>
    setCut((was) => {
      const next = { ...was };
      if (!value || was[key] === value) delete next[key]; else next[key] = value;
      return next;
    });

  const countOf = (axis: string, value: string) =>
    rows.filter((r) => (value === '__none__'
      ? (r.takes[axis] ?? []).length === 0
      : value === '__any__' ? (r.takes[axis] ?? []).length > 0
      : (r.takes[axis] ?? []).includes(value))).length;

  const saved: { key: string; label: string; count: number; set: Record<string, string> }[] = [
    { key: 'all', label: 'Everything', count: rows.length, set: {} as Record<string, string> },
    { key: 'unresolved', label: 'Unresolved', count: countOf('missing', '__any__'), set: { missing: '__any__' } as Record<string, string> },
    { key: 'awaiting', label: 'Awaiting client', count: countOf('missing', 'decision-client'), set: { missing: 'decision-client' } as Record<string, string> },
    { key: 'unscheduled', label: 'Not scheduled', count: countOf('missing', 'date'), set: { missing: 'date' } as Record<string, string> },
    { key: 'behind', label: 'Behind', count: countOf('when', 'earlier'), set: { when: 'earlier' } as Record<string, string> },
  ].filter((v) => v.count > 0 || v.key === 'all');
  const sameCut = (a: Record<string, string>) => {
    const keys = Object.keys(a);
    return keys.length === Object.keys(cut).length && keys.every((k) => cut[k] === a[k]);
  };

  const committed = React.useMemo(() => {
    const sum = new Map<string, { quantity: number; extra: number; undecided: number }>();
    for (const r of live) for (const c of r.committed) {
      const had = sum.get(c.deliverable) ?? { quantity: 0, extra: 0, undecided: 0 };
      had.quantity += c.quantity; had.extra += c.extra; had.undecided += c.undecided ? 1 : 0;
      sum.set(c.deliverable, had);
    }
    return [...sum.entries()].map(([deliverable, v]) => ({ deliverable, ...v }))
      .sort((a, b) => b.quantity + b.extra - (a.quantity + a.extra));
  }, [live]);

  /*
   * The dated readings follow the CUT, and they are arithmetic over rows in
   * hand - so narrowing the cut redraws the calendar with no request at all.
   */
  const dated = React.useMemo(() => datedFrom(inCut, today), [inCut, today]);

  const boardAxis = lenses.find((g) => g.key === boardAxisKey) ?? lenses.find((g) => g.key === 'stage') ?? lenses[0] ?? null;
  const boardCards: BoardCard[] = React.useMemo(() => live.map((r) => ({
    id: r.id, takes: r.takes, name: cardName(r), what: cardWhat(r),
    when: cardWhen(r, today), behind: r.day !== null && r.day < today, now: r.day === today,
    needs: cardNeeds(r), work: r.work && r.work.total > 0 ? { done: r.work.done, total: r.work.total } : null,
  })), [live, today]);

  /** Another month is a real new fact - the studio's own hours - so it is fetched. */
  const goToMonth = async (to: string) => {
    setMonthBusy(true);
    try {
      setMonth(await monthFrame(to));
    } finally {
      setMonthBusy(false);
    }
  };

  return (
    <div className="q-book">
      <header className="q-page-header">
        <div><h1 className="q-page-title">Bookings</h1></div>
        <div className="q-row q-row-sm">
          <Link href="/bookings/settings/stages" className="q-btn q-btn-ghost">Stages</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      </header>

      <div className="q-tabs">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" onClick={() => setView(v.key)}
                  className={view === v.key ? 'q-tab q-tab-on' : 'q-tab'} aria-pressed={view === v.key}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="q-cut">
        <div className="q-cut-saved">
          {saved.map((v) => (
            <button key={v.key} type="button" onClick={() => setCut(v.set)}
                    className={sameCut(v.set) ? 'q-cut-view q-cut-view-on' : 'q-cut-view'}>
              {v.label}<b>{v.count}</b>
            </button>
          ))}
        </div>
        <div className="q-cut-bar">
          {Object.entries(cut).map(([key, value]) => {
            const g = lenses.find((x) => x.key === key);
            if (!g) return null;
            return (
              <button key={key} type="button" className="q-cut-chip" onClick={() => narrow(key, null)}>
                <span>{g.label}</span>
                <b>{value === '__none__' ? g.none ?? 'None' : value === '__any__' ? 'Any' : g.items.find((i) => i.key === value)?.label ?? value}</b>
                <i aria-hidden="true">×</i>
              </button>
            );
          })}
          <Menu label="Narrow" items={lenses.flatMap((g) => [
            ...g.items.map((it) => ({ label: `${g.label}: ${it.label} (${it.count})`, on: cut[g.key] === it.key, act: () => narrow(g.key, it.key) })),
            ...(g.none ? [{ label: `${g.label}: ${g.none}`, on: cut[g.key] === '__none__', act: () => narrow(g.key, '__none__') }] : []),
          ])} />
          {Object.keys(cut).length > 0 && (
            <button type="button" className="q-cut-clear" onClick={() => setCut({})}>Clear</button>
          )}
          <span className="q-cut-count">
            {inCut.length === rows.length ? `${rows.length} bookings` : `${inCut.length} of ${rows.length} bookings`}
          </span>
        </div>
      </div>

      <section className="q-view">
        {view === 'register' && (
          <Register rows={inCut} lenses={lenses} today={today}
                    group={group} onGroup={setGroup} sort={sort} onSort={setSort} />
        )}

        {view === 'outstanding' && <Outstanding rows={live} today={today} />}

        {view === 'calendar' && (
          <Calendar
            month={month}
            rows={live}
            strip={dated.columns}
            weeks={dated.weeks}
            undated={dated.undated}
            busy={monthBusy}
            onMonth={goToMonth}
            onNarrowUndated={() => { narrow('missing', 'date'); setView('register'); }}
          />
        )}

        {view === 'board' && boardAxis && (
          <Board
            axis={boardAxis}
            cards={boardCards}
            axes={lenses.filter((g) => g.items.length > 1 || g.none).map((g) => ({
              key: g.key, label: g.label, on: g.key === boardAxis.key, act: () => setBoardAxisKey(g.key),
            }))}
            onCard={(id) => `/bookings/${id}`}
            onColumn={(itemKey) => narrow(boardAxis.key, itemKey)}
          />
        )}

        {view === 'distribution' && (
          <Distribution
            rows={live} lenses={lenses} figures={figures} months={months} series={series}
            periodDays={periodDays} committed={committed}
            onNarrow={(axis, value) => narrow(axis, value)}
          />
        )}
      </section>
    </div>
  );
}

/** A small menu, because three views need one and none of them needs a page. */
export function Menu({ label, items }: { label: string; items: { label: string; on: boolean; act: () => void }[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="q-reg-menu">
      <button type="button" className={open ? 'q-reg-btn q-reg-btn-open' : 'q-reg-btn'}
              onClick={() => setOpen(!open)} aria-expanded={open}>
        {label}<i className="q-reg-caret" aria-hidden="true">▾</i>
      </button>
      {open && (
        <span className="q-reg-pop">
          {items.map((it, i) => (
            <button key={i} type="button" className={it.on ? 'q-reg-pop-item q-reg-pop-on' : 'q-reg-pop-item'}
                    onClick={() => { it.act(); setOpen(false); }}>
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
