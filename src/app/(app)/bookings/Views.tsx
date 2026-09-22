import React from 'react';
import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';
import { MISSING } from '@/modules/bookings/sheet';
import { sayAbsence, sayNeeds, sayDay, plural, type Say } from '@/modules/bookings/say';
import type { RegisterRow, Figure } from '@/modules/bookings/interface';
import type { MonthDay } from '@/modules/bookings/month';
import type { LensGroup } from '@/kernel/lenses';

/**
 * THREE OF THE FIVE VIEWS - the ones that only draw, so they stay on the
 * server: Outstanding, Calendar and Distribution.
 *
 * Each is the presentation its own reading justifies (12-BOOKINGS_READABILITY
 * §3): an absence is a worklist in the order a booking resolves it; a point in
 * time belongs on the day it falls; a category read across a cut is a
 * proportion, and a count over a window is a trend. Nothing is re-derived -
 * every fact arrives decided.
 */

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

/** "2025-10" as the studio would read it. */
const sayMonth = (m: string) =>
  /^\d{4}-\d{2}$/.test(m)
    ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : m;

const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000));

/* ─────────────────────────── OUTSTANDING ───────────────────────────
 * Grouped by what is unresolved, in the order a booking resolves it: the date
 * that has passed before the proposal that was never issued, the proposal
 * before the classification. That order is the order of consequence.
 */
const ORDER = ['lapsed', 'decision-studio', 'reminder', 'client', 'package', 'date', 'classification', 'crew', 'decision-client'];

export function Outstanding({ rows, today }: { rows: RegisterRow[]; today: string }) {
  const groups = ORDER
    .map((key) => ({
      key,
      label: MISSING.find((m) => m.key === key)?.label ?? key,
      rows: rows.filter((r) => (r.takes.missing ?? []).includes(key)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }))
    .filter((g) => g.rows.length > 0);

  if (groups.length === 0) {
    return <p className="q-view-empty">Every booking in this cut has a complete record.</p>;
  }

  return (
    <div className="q-out">
      {groups.map((g) => (
        <section key={g.key} className="q-out-group">
          <div className="q-out-head"><Said say={sayAbsence(g.key, g.rows.length)} /></div>
          {g.rows.slice(0, 10).map((r) => (
            <Link key={r.id} href={`/bookings/${r.id}`} className="q-out-row">
              <span className="q-out-who">
                <span className="q-out-name">{r.clientName ?? r.title}</span>
                <span className="q-out-what">{r.packages.length > 0 ? r.packages.join(' · ') : 'No package recorded'}</span>
              </span>
              <span className="q-out-state"><Said say={sayNeeds(r, today)} /></span>
              <span className="q-out-tail">
                <span className="q-out-age">{plural(daysBetween(r.createdAt, today), 'day')} on the book</span>
                {r.stage && <span className={`q-badge ${stageBadgeClass(r.stage as any)}`}>{r.stage.name}</span>}
              </span>
            </Link>
          ))}
          {g.rows.length > 10 && <p className="q-out-more">{g.rows.length - 10} further bookings in this condition.</p>}
        </section>
      ))}
    </div>
  );
}

/* ─────────────────────────── CALENDAR ───────────────────────────
 * The studio's own days. What falls on each is said in words - a time, "shot",
 * "date passed", "occasion" - so the grid needs no key. The hours come from the
 * studio's own record, so a day it is shut says so rather than looking like a
 * day with nothing booked. Above, the same reading over the window; beneath,
 * the bookings that fall on no day at all, which is the fact about them.
 */
export function Calendar({ month, rows, strip, weeks, undated, undatedHref, previousHref, nextHref, todayHref }: {
  month: { label: string; days: MonthDay[]; today: string };
  rows: RegisterRow[];
  strip: { day: string; sessions: string[]; occasions: string[]; today: boolean; behind: boolean }[];
  weeks: { from: string; label: string; count: number }[];
  undated: number;
  undatedHref: string;
  previousHref: string;
  nextHref: string;
  todayHref: string;
}) {
  // What falls on a day, from the rows already in hand.
  type Item = { id: string; who: string; said: string; tone: 'time' | 'held' | 'lapsed' | 'occasion' };
  const onDay = new Map<string, Item[]>();
  const add = (day: string, item: Item) => (onDay.get(day) ?? onDay.set(day, []).get(day)!).push(item);
  for (const r of rows) {
    const who = r.clientName ?? r.title;
    if (r.day) {
      const held = r.day < month.today;
      const lapsed = held && r.stage?.kind !== 'booked';
      add(r.day, {
        id: r.id, who,
        said: lapsed ? 'date passed'
          : held ? 'shot'
          : r.scheduledFor ? new Date(r.scheduledFor).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          : 'session',
        tone: lapsed ? 'lapsed' : held ? 'held' : 'time',
      });
    }
    for (const f of r.facts) {
      if (f.kind === 'date' && f.day) add(f.day, { id: r.id, who, said: 'occasion', tone: 'occasion' });
    }
  }

  const most = Math.max(1, ...strip.map((c) => c.sessions.length), ...strip.map((c) => c.occasions.length));

  return (
    <div className="q-monthv">
      <div className="q-monthv-bar">
        <span className="q-monthv-label">{month.label}</span>
        <span className="q-monthv-nav">
          <Link href={previousHref} className="q-monthv-step" aria-label="The month before">←</Link>
          <Link href={nextHref} className="q-monthv-step" aria-label="The month after">→</Link>
        </span>
        <Link href={todayHref} className="q-reg-btn">Today</Link>
        <span className="q-monthv-note">
          Studio hours from the studio&apos;s own record, including the days it keeps differently
        </span>
      </div>

      {/* The window: the same reading, zoomed out, where a quiet fortnight shows at once. */}
      <div className="q-monthv-strip">
        <div className="q-monthv-strip-said">
          <span>Sixty days either side of today — sessions above the line, the occasions they are for below</span>
          <span className="q-monthv-quiet">
            {weeks.find((w) => w.label.startsWith('this week'))?.count ?? 0} this week
            {(() => {
              const after = weeks.filter((w) => w.from > month.today);
              const quiet = after.filter((w) => w.count === 0).length;
              return quiet > 0 ? `, none in ${plural(quiet, 'week')} after` : '';
            })()}
          </span>
        </div>
        <div className="q-days-strip">
          {strip.map((c) => (
            <span key={c.day} className={['q-day-col', c.today ? 'q-day-col-now' : '', c.behind ? 'q-day-col-behind' : ''].filter(Boolean).join(' ')}
                  title={[c.day, ...c.sessions, ...c.occasions].join(' · ')}>
              <span className="q-day-sessions">
                {c.sessions.length > 0 && <i className="q-day-bar" style={{ '--q-share': Math.round((c.sessions.length / most) * 100) } as React.CSSProperties} />}
              </span>
              <span className="q-day-line" />
              <span className="q-day-occasions">
                {c.occasions.length > 0 && <i className="q-day-bar q-day-bar-occasion" style={{ '--q-share': Math.round((c.occasions.length / most) * 100) } as React.CSSProperties} />}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="q-monthv-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="q-monthv-dow">{d}</div>
        ))}
        {month.days.map((d) => {
          const items = onDay.get(d.day) ?? [];
          const shut = d.hours.closed;
          return (
            <div key={d.day} className={[
              'q-monthv-cell',
              d.today ? 'q-monthv-cell-now' : '',
              d.inMonth ? '' : 'q-monthv-cell-out',
              shut ? 'q-monthv-cell-shut' : '',
            ].filter(Boolean).join(' ')}>
              <div className="q-monthv-cell-top">
                <span className="q-monthv-date">{d.date}</span>
                {d.today ? <span className="q-monthv-flag">today</span>
                  : shut ? <span className="q-monthv-flag">{d.hours.label ?? 'closed'}</span>
                  : d.hours.label ? <span className="q-monthv-flag">{d.hours.label}</span>
                  : d.hours.opensAt && d.hours.opensAt !== month.days.find((x) => x.inMonth && !x.hours.closed)?.hours.opensAt
                    ? <span className="q-monthv-flag">opens {d.hours.opensAt}</span>
                    : null}
              </div>
              {items.slice(0, 3).map((it, i) => (
                <Link key={`${it.id}-${i}`} href={`/bookings/${it.id}`} className={`q-monthv-item q-monthv-${it.tone}`}>
                  <span className="q-monthv-said">{it.said}</span>
                  <span className="q-monthv-who">{it.who}</span>
                </Link>
              ))}
              {items.length > 3 && <span className="q-monthv-more">{items.length - 3} more</span>}
            </div>
          );
        })}
      </div>

      {undated > 0 && (
        <Link href={undatedHref} className="q-monthv-tray">
          <b>{undated}</b>
          <span>
            {undated === 1 ? 'booking has' : 'bookings have'} no session date and {undated === 1 ? 'appears' : 'appear'} on no day above
            {(() => {
              const withOccasion = rows.filter((r) => !r.day && r.facts.some((f) => f.kind === 'date' && f.day)).length;
              return withOccasion > 0 ? `, ${withOccasion} of them with an occasion date already recorded` : '';
            })()}
          </span>
          <span className="q-monthv-tray-go">Narrow to them →</span>
        </Link>
      )}
    </div>
  );
}

/* ─────────────────────────── DISTRIBUTION ───────────────────────────
 * A category read across the cut is a proportion; a count over a window is a
 * trend. Every share carries its own word, count and percentage, so no bar
 * needs a key, and every axis is the studio's own.
 */
export function Distribution({ rows, lenses, figures, months, series, periodDays, narrowTo, committed }: {
  rows: RegisterRow[];
  lenses: LensGroup[];
  figures: Figure[];
  months: string[];
  series: { key: string; label: string; points: number[] }[];
  periodDays: number;
  narrowTo: Record<string, string>;
  committed: { deliverable: string; quantity: number; extra: number; undecided: number }[];
}) {
  const axes = lenses
    .map((g) => {
      const counted = [
        ...g.items.map((it) => ({
          key: it.key, label: it.label, colour: it.look?.color ?? null,
          count: rows.filter((r) => (r.takes[g.key] ?? []).includes(it.key)).length,
        })),
        ...(g.none ? [{ key: '__none__', label: g.none, colour: null, count: rows.filter((r) => (r.takes[g.key] ?? []).length === 0).length }] : []),
      ].filter((i) => i.count > 0);
      /*
       * A BOOKING MAY TAKE SEVERAL VALUES on some axes - what it is missing,
       * the roles it needs - so the counts do not partition the set and a
       * share of their sum would be a made-up denominator. Measured against
       * the bookings instead, and said so, the bars overrun 100% honestly
       * rather than reading as a pie that happens not to add up.
       */
      const many = rows.some((r) => (r.takes[g.key] ?? []).length > 1);
      return { g, counted, many, total: many ? rows.length : counted.reduce((n, i) => n + i.count, 0) };
    })
    .filter((a) => a.counted.length > 0);

  return (
    <div className="q-dist2">
      {axes.map(({ g, counted, many, total }) => (
        <section key={g.key} className="q-dist2-axis">
          <div className="q-dist2-head">
            <span className="q-dist2-name">{g.label}</span>
            <span className="q-dist2-of">
              {plural(total, 'booking')}{many ? ', a booking may take more than one' : ''}
            </span>
          </div>
          <div className="q-dist2-bar">
            {counted.map((i) => (
              <i key={i.key} className={i.colour ? `q-dist-c-${i.colour}` : undefined}
                 style={{ '--q-share': Math.round((i.count / Math.max(1, total)) * 100) } as React.CSSProperties} />
            ))}
          </div>
          <div className="q-dist2-keys">
            {counted.map((i) => (
              <Link key={i.key} href={narrowTo[`${g.key}:${i.key}`] ?? '/bookings'} className="q-dist2-key">
                <i className={i.colour ? `q-dist2-dot q-dist-c-${i.colour}` : 'q-dist2-dot'} />
                <span>{i.label}</span>
                <b>{i.count}</b>
                <em>{Math.round((i.count / Math.max(1, total)) * 100)}%</em>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {committed.length > 0 && (
        <section className="q-dist2-axis">
          <div className="q-dist2-head">
            <span className="q-dist2-name">Committed deliverables</span>
            <span className="q-dist2-of">production not recorded</span>
          </div>
          <div className="q-dist2-lines">
            {committed.map((c) => (
              <p key={c.deliverable} className="q-dist2-line">
                <b>{c.quantity + c.extra}</b> {c.deliverable.toLowerCase()}
                {c.extra > 0 && <span className="q-dist2-quiet"> including {c.extra} added as extras</span>}
                {c.undecided > 0 && <span className="q-said-warm"> · {plural(c.undecided, 'commitment')} with no quantity recorded</span>}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="q-dist2-axis q-dist2-last">
        <div className="q-dist2-head">
          <span className="q-dist2-name">Last {periodDays} days</span>
          <span className="q-dist2-of">against the preceding {periodDays} days</span>
        </div>
        <div className="q-dist2-measures">
          {figures.map((f) => {
            const line = series.find((l) => l.key === f.key)?.points ?? null;
            const W = 190, H = 34, PAD = 3;
            const max = line ? Math.max(...line, 1) : 1;
            const path = line && line.length > 1
              ? line.map((v, i) => `${i === 0 ? 'M' : 'L'}${(PAD + (i / (line.length - 1)) * (W - PAD * 2)).toFixed(1)},${(H - PAD - (v / max) * (H - PAD * 2)).toFixed(1)}`).join(' ')
              : null;
            return (
              <div key={f.key} className="q-dist2-measure">
                <span className="q-dist2-label">{f.label}</span>
                <span className="q-dist2-value">
                  {f.unit === 'percent' ? `${f.value}%` : f.value}
                  <em>against {f.unit === 'percent' ? `${f.before}%` : f.before === 0 ? 'none' : f.before}</em>
                </span>
                {path && (
                  <svg className="q-dist2-trend" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${f.label} by month`}>
                    <path d={path} vectorEffect="non-scaling-stroke" />
                  </svg>
                )}
                {path && <span className="q-dist2-axis-said">{sayMonth(months[0])} to {sayMonth(months[months.length - 1])}</span>}
                {f.note && <span className="q-dist2-note">{f.note}</span>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
