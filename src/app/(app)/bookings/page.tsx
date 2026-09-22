import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  readBookingsRegister, readBookingsDashboard, PERIODS, plural, sayDay,
  type Period, type RegisterRow,
} from '@/modules/bookings/interface';
import { Board, type BoardCard } from '@/components/Board';
import { Days } from '@/components/Readings';
import { cardName, cardWhat, cardWhen, cardNeeds } from '@/modules/bookings/say';
import { Register } from './Register';

export const dynamic = 'force-dynamic';

/**
 * BOOKINGS - one set of rows, read three ways, under a small dashboard.
 *
 * THE DASHBOARD is three bands and no more: what is happening today, which
 * cannot wait for a filter; what requires the studio, worst consequence
 * first; and what is elsewhere - outstanding with clients, in production, and
 * the shape of the book. Every figure in it is a LINK THAT NARROWS THE TABLE
 * BELOW rather than a door to another page, so the summary and the rows are
 * one surface and cannot disagree: they are the same rows.
 *
 * THE VIEWS are three presentations of that one set:
 *   table     the register - every fact a column, narrowed, grouped, sorted.
 *   board     columns by whichever axis is chosen; no axis is the hierarchy.
 *   calendar  the same rows placed in time, with those that cannot be placed
 *             counted beside it.
 * The view, the cut, the grouping and the sort all live in the URL, so a cut
 * is a link and the back button works.
 *
 * Money is not on this page: value and settlement are reported in Finances.
 */

type Query = Record<string, string | string[] | undefined>;
/** The page's own parameters - everything else in the URL is a cut on an axis. */
const OWN = new Set(['view', 'group', 'sort', 'find', 'period', 'board']);
type View = 'table' | 'board' | 'calendar';

export default async function BookingsPage(props: { searchParams: Promise<Query> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const params = await props.searchParams;
  const q: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && v) q[k] = v;

  const periodDays = (PERIODS.find((p) => String(p.days) === q.period)?.days ?? 30) as Period;
  const [{ sheet, rows }, dash] = await Promise.all([
    readBookingsRegister(periodDays),
    readBookingsDashboard(periodDays),
  ]);

  const view: View = q.view === 'board' ? 'board' : q.view === 'calendar' ? 'calendar' : 'table';
  const live = rows.filter((r) => r.band !== 'closed');
  const today = new Date(`${sheet.today}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  /** One URL shape for every control on the page: patch what changes, keep the rest. */
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return `/bookings${s ? `?${s}` : ''}`;
  };
  /** A figure in the dashboard: one cut, the rest of the URL kept, the view kept. */
  const narrow = (axis: string, value: string) => href({ [axis]: q[axis] === value ? null : value });
  const isOn = (axis: string, value: string) => q[axis] === value;

  // ---- the three bands
  const sessionsToday = dash.today;
  const absences = dash.attention.filter((a) => a.count > 0);
  const waitingOnClient = dash.attention.find((a) => a.key === 'decision-client')?.count ?? 0;
  const stageShare = dash.pipeline.filter((s) => s.count > 0);
  const stageTotal = stageShare.reduce((n, s) => n + s.count, 0);
  const committedTotal = new Map<string, number>();
  for (const r of live) for (const c of r.committed) committedTotal.set(c.deliverable, (committedTotal.get(c.deliverable) ?? 0) + c.quantity + c.extra);
  const biggestPromise = [...committedTotal.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  // ---- the saved views: cuts the derivation produced, each with its own count
  const cutCount = (axis: string, value: string) =>
    rows.filter((r) => (value === '__none__' ? (r.takes[axis] ?? []).length === 0 : (r.takes[axis] ?? []).includes(value))).length;
  const saved = [
    { key: 'all', label: 'Everything', count: rows.length, href: href({ missing: null, when: null, stage: null }), on: !Object.keys(q).some((k) => !OWN.has(k)) },
    { key: 'awaiting', label: 'Awaiting agreement', count: cutCount('missing', 'decision-client'), href: href({ missing: 'decision-client', when: null, stage: null }), on: q.missing === 'decision-client' },
    { key: 'unscheduled', label: 'Not scheduled', count: cutCount('missing', 'date'), href: href({ missing: 'date', when: null, stage: null }), on: q.missing === 'date' },
    { key: 'behind', label: 'Behind', count: cutCount('when', 'earlier'), href: href({ when: 'earlier', missing: null, stage: null }), on: q.when === 'earlier' },
  ].filter((v) => v.count > 0 || v.key === 'all');

  // ---- the board view's cards and axis
  const boardKey = q.board ?? 'stage';
  const boardAxis = sheet.lenses.find((g) => g.key === boardKey) ?? sheet.lenses.find((g) => g.key === 'stage') ?? sheet.lenses[0] ?? null;
  const boardCards: BoardCard[] = live.map((r) => ({
    id: r.id, takes: r.takes, name: cardName(r), what: cardWhat(r),
    when: cardWhen(r, sheet.today), behind: r.day !== null && r.day < sheet.today, now: r.day === sheet.today,
    needs: cardNeeds(r), work: r.work && r.work.total > 0 ? { done: r.work.done, total: r.work.total } : null,
  }));

  const viewLink = (v: View, label: string) => (
    <Link href={href({ view: v === 'table' ? null : v })} className={view === v ? 'q-switch-btn q-switch-on' : 'q-switch-btn'}>{label}</Link>
  );

  return (
    <div className="q-book">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
        </div>
        <div className="q-row q-row-sm">
          <Link href="/bookings/settings/stages" className="q-btn q-btn-ghost">Stages</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      </header>

      {/* ── the small dashboard: three bands, every figure a cut on the table below ── */}
      <section className="q-bands">
        <div className="q-band q-band-today">
          <span className="q-band-day">{today}</span>
          {sessionsToday.length === 0 ? (
            <span className="q-band-said">
              No session today.
              {dash.dated.ahead > 0 && (() => {
                const next = live.filter((r) => r.day && r.day > sheet.today).sort((a, b) => (a.day ?? '').localeCompare(b.day ?? ''))[0];
                return next?.day ? <> Next is {next.clientName ?? next.title}, {sayDay(next.day, sheet.today)}.</> : null;
              })()}
            </span>
          ) : (
            <span className="q-band-said">
              {sessionsToday.map((n, i) => (
                <span key={n.booking.id}>
                  {i > 0 && <span className="q-band-sep"> · </span>}
                  <Link href={`/bookings/${n.booking.id}`} className="q-band-name">{n.booking.clientName ?? n.booking.title}</Link>
                  {n.booking.scheduledFor && <> {new Date(n.booking.scheduledFor).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</>}
                  {(n.booking.work?.unstaffed ?? 0) > 0
                    ? <span className="q-band-warm"> — {plural(n.booking.work!.unstaffed, 'step')} unassigned</span>
                    : n.crew.length > 0 ? <> — {n.crew[0]}</> : <span className="q-band-warm"> — nobody assigned</span>}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="q-band">
          <span className="q-band-label">Requires you</span>
          <span className="q-band-doors">
            {absences.map((a) => (
              <Link key={a.key} href={narrow('missing', a.key)} className={isOn('missing', a.key) ? 'q-door q-door-on' : 'q-door'}>
                <b>{a.count}</b><span>{a.label.toLowerCase()}</span>
              </Link>
            ))}
          </span>
        </div>

        <div className="q-band">
          <span className="q-band-label">Elsewhere</span>
          <span className="q-band-doors">
            {waitingOnClient > 0 && (
              <Link href={narrow('missing', 'decision-client')} className={isOn('missing', 'decision-client') ? 'q-door q-door-on' : 'q-door'}>
                <b>{waitingOnClient}</b><span>awaiting client</span>
              </Link>
            )}
            {dash.works.length > 0 && (
              <Link href={narrow('when', 'earlier')} className={isOn('when', 'earlier') ? 'q-door q-door-on' : 'q-door'}>
                <b>{dash.works.length}</b><span>in post-production</span>
              </Link>
            )}
            <span className="q-band-shape">
              <span className="q-band-bar">
                {stageShare.map((s) => (
                  <i key={s.key} className={s.look?.color ? `q-dist-c-${s.look.color}` : undefined} style={{ '--q-share': Math.round((s.count / Math.max(1, stageTotal)) * 100) } as React.CSSProperties} />
                ))}
              </span>
              <span className="q-band-note">{stageShare.map((s) => `${s.count} at ${s.label}`).join(', ')}</span>
            </span>
            {biggestPromise && (
              <span className="q-band-note">
                {biggestPromise[1]} {biggestPromise[0].toLowerCase()} committed
                <span className="q-band-quiet"> · production not recorded</span>
              </span>
            )}
          </span>
        </div>
      </section>

      {/* ── one set of rows, three presentations ── */}
      <div className="q-switch">
        {viewLink('table', 'Table')}
        {viewLink('board', 'Board')}
        {viewLink('calendar', 'Calendar')}
      </div>

      {view === 'table' && (
        <Suspense fallback={null}>
          <Register rows={rows} lenses={sheet.lenses} q={q} today={sheet.today} views={saved} />
        </Suspense>
      )}

      {view === 'board' && boardAxis && (
        <section className="q-reg">
          <Board
            axis={boardAxis}
            cards={boardCards}
            axes={sheet.lenses.filter((g) => g.items.length > 1 || g.none).map((g) => ({
              key: g.key, label: g.label, href: href({ board: g.key === 'stage' ? null : g.key }), on: g.key === boardAxis.key,
            }))}
            hrefFor={(c) => `/bookings/${c.id}`}
            cutFor={(itemKey) => href({ [boardAxis.key]: itemKey, view: null })}
          />
        </section>
      )}

      {view === 'calendar' && (
        <section className="q-reg">
          <Days cells={dash.dated.columns} weeks={dash.dated.weeks} />
          <div className="q-cal-under">
            {dash.dated.days.filter((d) => d.day >= sheet.today).slice(0, 8).map((d) => (
              <div key={d.day} className={d.today ? 'q-cal-line q-cal-line-now' : 'q-cal-line'}>
                <span className="q-cal-when">{d.today ? 'Today' : sayDay(d.day, sheet.today)}</span>
                <span className="q-cal-what">
                  {d.lines.map((l, i) => (
                    <Link key={i} href={`/bookings/${l.bookingId}`} className="q-cal-item">{l.say.map((p) => p.t).join(' ')}</Link>
                  ))}
                </span>
              </div>
            ))}
            {dash.dated.undated > 0 && (
              <Link href={narrow('missing', 'date')} className="q-cal-tray">
                {plural(dash.dated.undated, 'booking')} cannot be placed at all — no session date →
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
