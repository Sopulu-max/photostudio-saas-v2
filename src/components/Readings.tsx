'use client';

import React from 'react';
import Link from 'next/link';

/**
 * READINGS - the drawings this page is allowed, and the reason each one is a
 * drawing rather than a sentence (12-BOOKINGS_READABILITY Law 4).
 *
 * A mark that STANDS FOR a fact needs a legend and is banned. A mark whose
 * GEOMETRY IS the fact is read on sight, so it stays - as long as it carries
 * its own dates, names and numbers rather than sitting naked beside a key:
 *
 *   Days      position on a dated axis IS when; two on one column IS a
 *             collision; a gap IS an empty week.
 *   Share     length IS the proportion of the whole - the lopsidedness a pair
 *             of numbers cannot show.
 *   Progress  length IS how far along, comparable down a column at a glance.
 *   Trend     slope IS the direction over months, which this window's number
 *             cannot carry.
 *
 * Every one of them prints its numbers and labels inside itself. Pure and
 * server-rendered; numbers ride on custom properties, as FramePreview sizes
 * itself, because that is the one value a class cannot hold.
 */

const share = (n: number) => ({ '--q-share': n } as React.CSSProperties);

/* ─────────────────────────────── DAYS ─────────────────────────────── */

export type DayCell = {
  day: string;
  /** Sessions on this day, and the names on them - printed, never hovered for. */
  sessions: string[];
  occasions: string[];
  today: boolean;
  /** The day is in the past. */
  behind: boolean;
};

/**
 * THE STUDIO'S DAYS, one column each, sessions over occasions on the same
 * columns so a shoot and the thing it is for read against each other. The
 * count sits in the column; the dates label the axis; today says "today".
 */
export function Days({ cells, weeks }: { cells: DayCell[]; weeks: { from: string; label: string; count: number }[] }) {
  const most = Math.max(1, ...cells.map((c) => c.sessions.length), ...cells.map((c) => c.occasions.length));
  return (
    <div className="q-days">
      <div className="q-days-strip" role="img" aria-label={`Sessions and occasions, ${cells[0]?.day} to ${cells[cells.length - 1]?.day}`}>
        {cells.map((c) => (
          <span
            key={c.day}
            className={['q-day-col', c.today ? 'q-day-col-now' : '', c.behind ? 'q-day-col-behind' : ''].filter(Boolean).join(' ')}
            title={[c.day, ...c.sessions.map((s) => `${s} shoots`), ...c.occasions].join(' · ')}
          >
            <span className="q-day-sessions">
              {c.sessions.length > 0 && <i className="q-day-bar" style={share(Math.round((c.sessions.length / most) * 100))} />}
              {c.sessions.length > 1 && <b className="q-day-n">{c.sessions.length}</b>}
            </span>
            <span className="q-day-line" />
            <span className="q-day-occasions">
              {c.occasions.length > 0 && <i className="q-day-bar q-day-bar-occasion" style={share(Math.round((c.occasions.length / most) * 100))} />}
              {c.occasions.length > 1 && <b className="q-day-n">{c.occasions.length}</b>}
            </span>
          </span>
        ))}
      </div>
      <div className="q-days-weeks">
        {weeks.map((w) => (
          <span key={w.from} className="q-days-week">
            <span className="q-days-week-when">{w.label}</span>
            <span className="q-days-week-n">{w.count === 0 ? 'nothing' : `${w.count} session${w.count === 1 ? '' : 's'}`}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────── SHARE ─────────────────────────────── */

export type Slice = { key: string; label: string; count: number; color?: string | null; href?: string; tone?: 'warm' | 'accent' | 'green' };

/**
 * THE SHAPE OF THE WHOLE: one bar, each part as long as its share, its own
 * word and count printed on it when it fits and beside it when it does not.
 */
export function Share({ slices, of }: { slices: Slice[]; of: number }) {
  const total = of || slices.reduce((n, s) => n + s.count, 0);
  return (
    <div className="q-share">
      <div className="q-share-bar">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
          const cls = ['q-share-part', s.color ? `q-dist-c-${s.color}` : s.tone ? `q-share-${s.tone}` : 'q-share-plain'].join(' ');
          const body = <span className={cls} style={share(pct)} title={`${s.label}: ${s.count} of ${total}`} />;
          return s.href ? <Link key={s.key} href={s.href} className="q-share-link" style={share(pct)}>{body}</Link> : <React.Fragment key={s.key}>{body}</React.Fragment>;
        })}
      </div>
      <div className="q-share-keys">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
          const inner = (
            <>
              <i className={s.color ? `q-share-dot q-dist-c-${s.color}` : s.tone ? `q-share-dot q-share-${s.tone}` : 'q-share-dot q-share-plain'} />
              <span className="q-share-word">{s.label}</span>
              <b className="q-share-n">{s.count}</b>
              <span className="q-share-pct">{pct}%</span>
            </>
          );
          return s.href
            ? <Link key={s.key} href={s.href} className="q-share-key">{inner}</Link>
            : <span key={s.key} className="q-share-key">{inner}</span>;
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────── PROGRESS ─────────────────────────────── */

/** How far along, with the count it draws printed on it. */
export function Progress({ done, total, said }: { done: number; total: number; said: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className="q-progress" title={said}>
      <span className="q-progress-track"><i className={done === total ? 'q-progress-fill q-progress-done' : 'q-progress-fill'} style={share(pct)} /></span>
      <span className="q-progress-said">{said}</span>
    </span>
  );
}

/** One quantity against the others of its kind - the studio's own words down the side. */
export function Counts({ rows }: { rows: { key: string; label: string; count: number; said: string; href?: string; warm?: boolean }[] }) {
  const most = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="q-counts">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="q-counts-said">{r.said}</span>
            <span className="q-counts-track"><i className={r.warm ? 'q-counts-fill q-counts-warm' : 'q-counts-fill'} style={share(Math.round((r.count / most) * 100))} /></span>
          </>
        );
        return r.href
          ? <Link key={r.key} href={r.href} className="q-counts-row">{inner}</Link>
          : <span key={r.key} className="q-counts-row">{inner}</span>;
      })}
    </div>
  );
}

/* ─────────────────────────────── TREND ─────────────────────────────── */

/**
 * THE DIRECTION over months - the reading this window's number cannot carry.
 * The months label the axis and the end values are printed, so the line is
 * read without a key or a hover.
 */
export function Trend({ points, months, said }: { points: number[]; months: string[]; said: string }) {
  const W = 220, H = 44, PAD = 4;
  const max = Math.max(...points, 1);
  const n = points.length;
  const x = (i: number) => (n > 1 ? PAD + (i / (n - 1)) * (W - PAD * 2) : W / 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  return (
    <div className="q-trend">
      <svg className="q-trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={said}>
        <path className="q-trend-area" d={area} />
        <path className="q-trend-line" d={line} vectorEffect="non-scaling-stroke" />
        <circle className="q-trend-end" cx={x(n - 1)} cy={y(points[n - 1] ?? 0)} r="2.5" />
      </svg>
      <span className="q-trend-axis">
        <span>{months[0]}</span>
        <span className="q-trend-peak">highest {max}</span>
        <span>{months[months.length - 1]}</span>
      </span>
    </div>
  );
}
