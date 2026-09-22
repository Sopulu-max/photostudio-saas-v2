import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { readBookingsDashboard, PERIODS, type Period, type Figure, type NextRow, type SheetBooking } from '@/modules/bookings/interface';
import { stageColor } from '@/components/stageBadge';
import { Sparkline } from '@/components/Charts';
import { StrandKey, StrandRow, StrandCaption } from '@/components/Strand';
import { BookingsDayBook } from './BookingsDayBook';

export const dynamic = 'force-dynamic';

/**
 * BOOKINGS - one page at two levels of one subject, made of strands
 * (11-BOOKINGS_INFORMATION_ARCHITECTURE §9; the design canvas, boards 4-6).
 *
 * THE SUMMARY LEVEL, at /bookings: lanes of strands under the questions a
 * studio asks in the order it asks them, with the totals sitting over the
 * very columns they count -
 *   Today: strands whose session touches now.
 *   Requires attention: strands with an empty point, earliest empty point
 *     first; the column totals (client · pkg · date · agreed · for) and the
 *     open points by role over the steps.
 *   Post-production: the session behind now, steps still open; then
 *     complete but not closed.
 *   One calendar: every strand's dated facts on the studio's one axis.
 *   Pipeline, This period, Recent activity.
 *
 * THE ROWS LEVEL, at /bookings?<axes>: one cut, its definition once, its
 * strands grouped - every door above opens it.
 *
 * Everything arrives decided (readBookingsDashboard); the page draws.
 */

type Query = Record<string, string | string[] | undefined>;
const OWN = new Set(['period', 'measure']);

function withParams(q: Query, patch: Record<string, string | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (typeof v === 'string' && v) p.set(k, v);
  for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
  const s = p.toString();
  return `/bookings${s ? `?${s}` : ''}`;
}
/** A door: the rows level on exactly one question, nothing else carried over. */
const into = (narrow: Record<string, string>) => `/bookings?${new URLSearchParams(narrow)}`;

const ago = (iso: string, now: number) => {
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};
const pct = (offset: number) => 50 + Math.max(-30, Math.min(30, offset)) * (50 / 30);
const dayLabel = (today: string, offset: number) => {
  const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/* The order a job resolves its absences, so a strand sorts by its earliest empty point. */
const RESOLVE = ['lapsed', 'decision-studio', 'decision-client', 'reminder', 'client', 'date', 'package', 'classification', 'crew'];
function firstEmpty(r: SheetBooking) {
  const idx = (r.takes.missing ?? []).map((k) => RESOLVE.indexOf(k)).filter((i) => i >= 0);
  return idx.length > 0 ? Math.min(...idx) : RESOLVE.length;
}

function CalRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="q-cal-row">
      <span className="q-cal-name">{name}</span>
      <span className="q-cal-axis">
        {[0, 16.67, 33.33, 66.67, 83.33, 100].map((x) => <i key={x} className="q-cal-tick" style={{ '--q-x': x } as React.CSSProperties} />)}
        <i className="q-cal-now" />
        {children}
      </span>
    </div>
  );
}

export default async function BookingsPage(props: { searchParams: Promise<Query> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const q = await props.searchParams;
  const periodDays = (PERIODS.find((p) => String(p.days) === q.period)?.days ?? 30) as Period;
  const dash = await readBookingsDashboard(periodDays);
  const { sheet, attention, roleTotals, calendar, today, week, later, works, toClose, pipeline, recent } = dash;
  const now = Date.now();
  const todayDate = new Date(`${sheet.today}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const all = sheet.bands.flatMap((b) => b.rows);
  const live = all.filter((r) => r.band !== 'closed');

  // ---- The rows level: a cut is set when any parameter other than the page's own is present.
  const cutSet = Object.entries(q).some(([k, v]) => typeof v === 'string' && v && !OWN.has(k));
  if (cutSet) {
    const setAxes = sheet.lenses.filter((g) => typeof q[g.key] === 'string' && q[g.key]);
    const titleParts = setAxes.map((g) => (q[g.key] === '__none__' ? g.none ?? 'None' : g.items.find((it) => it.key === q[g.key])?.label ?? g.label));
    const title = titleParts.length > 0 ? titleParts.join(' · ') : 'All bookings';
    return (
      <div>
        <header className="q-page-header">
          <div>
            <Link href="/bookings" className="q-meta-sm q-plain-link">← Bookings</Link>
            <h1 className="q-page-title">{title}</h1>
            <p className="q-page-subtitle">{setAxes.length > 0 ? 'One cut of every booking — its definition below, once.' : 'Every booking — narrow, group, read.'}</p>
          </div>
          <div className="q-row q-row-sm">
            <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
          </div>
        </header>
        <Suspense fallback={null}>
          <BookingsDayBook sheet={sheet} />
        </Suspense>
      </div>
    );
  }

  // ---- The summary level.
  const emptyPoints = attention.reduce((n, a) => n + a.count, 0);
  const totalOf = (key: string) => attention.find((a) => a.key === key)?.count ?? 0;
  const studio = totalOf('decision-studio');
  const client = totalOf('decision-client');
  const withEmpty = live.filter((r) => (r.takes.missing ?? []).length > 0)
    .sort((a, b) => firstEmpty(a) - firstEmpty(b) || a.createdAt.localeCompare(b.createdAt));
  const total = pipeline.reduce((n, s) => n + s.count, 0);
  const ahead30 = calendar.sessions.filter((s) => s.offset >= 0).length;

  const say = (f: Figure, n: number) => (f.unit === 'percent' ? `${n}%` : String(n));
  const delta = (f: Figure) => {
    const diff = f.value - f.before;
    const dir: 'up' | 'down' | 'flat' = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    const text = diff === 0 ? 'unchanged' : f.unit === 'percent' ? `${sign}${Math.abs(diff)} pts` : f.before >= 5 ? `${sign}${Math.abs(Math.round((diff / f.before) * 100))}%` : `${sign}${Math.abs(diff)}`;
    return { dir, text, title: `${say(f, f.before)} in the previous ${sheet.period.days} days` };
  };
  const trend = (f: Figure) => sheet.series.lines.find((l) => l.key === f.key)?.points ?? null;

  const Total = ({ n, label, narrow, align }: { n: number; label: string; narrow?: Record<string, string>; align?: 'start' | 'end' }) => {
    const cls = ['q-total', n > 0 ? 'q-total-live' : '', align ? `q-total-${align}` : ''].filter(Boolean).join(' ');
    const body = <><b>{n}</b><small>{label}</small></>;
    return n > 0 && narrow ? <Link href={into(narrow)} className={cls}>{body}</Link> : <span className={cls}>{body}</span>;
  };
  const sessionRow = (r: NextRow) => (
    <StrandRow key={r.booking.id} b={r.booking} caption={
      <>
        <StrandCaption b={r.booking} crew={r.crew} />
        {r.unanswered.map((l) => <span key={l}><span className="q-strand-cap-sep"> · </span><span className="q-fact q-fact-unanswered"><span className="q-fact-label">{l}</span> unanswered</span></span>)}
      </>
    } />
  );

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">Every job as a line: what it has, what it is for, where it is in time, what it still needs.</p>
        </div>
        <div className="q-row q-row-sm">
          <Link href="/bookings/settings" className="q-btn q-btn-secondary">Stages</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      </header>

      <div className="q-stack q-stack-md">
        {/* THE HEADLINE: the day, and the numbers that decide it. */}
        <p className="q-headline">
          <span className="q-headline-day">{todayDate}</span>
          <span className="q-headline-sep" aria-hidden="true">·</span>
          <a href="#today" className="q-headline-part">{today.length === 0 ? 'No sessions today' : <><b>{today.length}</b> session{today.length === 1 ? '' : 's'} today</>}</a>
          <span className="q-headline-sep" aria-hidden="true">·</span>
          <a href="#attention" className={emptyPoints > 0 ? 'q-headline-part q-headline-warm' : 'q-headline-part'}>{emptyPoints === 0 ? 'No empty points on live jobs' : <><b>{emptyPoints}</b> empty point{emptyPoints === 1 ? '' : 's'} on live jobs</>}</a>
          <span className="q-headline-sep" aria-hidden="true">·</span>
          <a href="#post" className="q-headline-part">{works.length === 0 ? 'Nothing in post-production' : <><b>{works.length}</b> in post-production</>}</a>
          <span className="q-headline-sep" aria-hidden="true">·</span>
          <a href="#calendar" className="q-headline-part"><b>{ahead30}</b> session{ahead30 === 1 ? '' : 's'} in the next 30 days</a>
          <span className="q-headline-sep" aria-hidden="true">·</span>
          <Link href={into({ group: 'stage' })} className="q-headline-part q-headline-door">All {all.length} →</Link>
        </p>

        <StrandKey />

        {/* TODAY */}
        <section id="today" className="q-lane" aria-label="Today">
          <div className="q-lane-head q-lane-head-today"><span className="q-lane-title">Today</span><span className="q-lane-note">strands whose session touches now</span></div>
          {today.length === 0 ? <p className="q-lane-empty">No sessions today.</p> : today.map(sessionRow)}
          {week.length > 0 && (
            <>
              <div className="q-lane-head"><span className="q-lane-title">Rest of this week</span><Link href={into({ when: 'week' })} className="q-lane-note q-plain-link">View all →</Link></div>
              {week.map(sessionRow)}
            </>
          )}
          {today.length === 0 && week.length === 0 && later.length > 0 && (
            <>
              <div className="q-lane-head"><span className="q-lane-title">Upcoming</span><Link href={into({ when: 'later' })} className="q-lane-note q-plain-link">View all →</Link></div>
              {later.map(sessionRow)}
            </>
          )}
        </section>

        {/* REQUIRES ATTENTION: the totals over the columns they count, then the strands. */}
        <section id="attention" className="q-lane" aria-label="Requires attention">
          <div className="q-lane-head"><span className="q-lane-title">Requires attention</span><span className="q-lane-note">live strands with an empty point · earliest empty point first</span></div>
          <div className="q-strand q-totals">
            <span className="q-totals-word">empty points, by column →</span>
            <span className="q-strand-intake">
              <Total n={totalOf('client')} label="client" narrow={{ missing: 'client' }} />
              <Total n={totalOf('package')} label="pkg" narrow={{ missing: 'package' }} />
              <Total n={totalOf('date')} label="date" narrow={{ missing: 'date' }} />
              <Total n={studio + client} label="agreed" narrow={{ missing: 'decision-studio' }} />
            </span>
            <Total n={totalOf('classification')} label="open" narrow={{ missing: 'classification' }} align="start" />
            <span className="q-totals-roles">
              <Total n={totalOf('lapsed')} label="date passed" narrow={{ missing: 'lapsed' }} align="start" />
              <Total n={totalOf('reminder')} label="reminders" narrow={{ missing: 'reminder' }} align="start" />
            </span>
            <span className="q-totals-roles">
              {roleTotals.map((r) => <Total key={r.id} n={r.count} label={r.name} narrow={{ needs: r.id }} align="start" />)}
              {roleTotals.length === 0 && <span className="q-totals-word">no open points need a role</span>}
            </span>
            <span className="q-total q-total-end">
              <small>of {studio + client} awaiting agreement</small>
              <small className="q-strand-fig-warm">{studio} you · {client} the client</small>
            </span>
          </div>
          {withEmpty.length === 0 ? <p className="q-lane-empty">Nothing outstanding.</p> : withEmpty.slice(0, 6).map((b) => <StrandRow key={b.id} b={b} />)}
          {withEmpty.length > 6 && <Link href={into({ missing: RESOLVE[firstEmpty(withEmpty[6])] ?? 'date' })} className="q-lane-more">{withEmpty.length - 6} more with an empty point <span className="q-accent">→</span></Link>}
        </section>

        {/* POST-PRODUCTION */}
        <section id="post" className="q-lane" aria-label="Post-production">
          <div className="q-lane-head"><span className="q-lane-title">Post-production</span><span className="q-lane-note">the session behind now, steps still open · oldest first{toClose.length > 0 ? ` · ${toClose.length} ready to close` : ''}</span></div>
          {works.length === 0 && toClose.length === 0 ? <p className="q-lane-empty">No sessions awaiting post-production.</p> : (
            <>
              {works.map((w) => <StrandRow key={w.booking.id} b={w.booking} href={`/bookings/${w.booking.id}#work`} caption={<StrandCaption b={w.booking} />} />)}
              {toClose.map((b) => <StrandRow key={b.id} b={b} caption={<StrandCaption b={b} />} />)}
            </>
          )}
        </section>

        {/* ONE CALENDAR */}
        <section id="calendar" className="q-lane q-cal-lane" aria-label="One calendar">
          <div className="q-lane-head"><span className="q-lane-title">One calendar</span><span className="q-lane-note">every strand's sessions, occasions and reminders on the studio's one axis · collisions and load read across</span></div>
          <div className="q-cal-row q-cal-head">
            <span>the last and next thirty days</span>
            <span className="q-cal-head-axis">{[-30, -20, -10].map((o) => <span key={o}>{dayLabel(sheet.today, o)}</span>)}<span className="q-strand-now-word">today · {dayLabel(sheet.today, 0)}</span>{[10, 20, 30].map((o) => <span key={o}>{dayLabel(sheet.today, o)}</span>)}</span>
          </div>
          <CalRow name={`Sessions · ${calendar.sessions.length}`}>
            {calendar.sessions.map((s) => (
              <Link key={s.booking.id} href={`/bookings/${s.booking.id}`} className={`q-mark ${s.today ? 'q-mark-session q-mark-session-today' : s.held ? 'q-mark-held' : 'q-mark-session'}`} style={{ '--q-x': pct(s.offset) } as React.CSSProperties} title={`${s.booking.title} · ${dayLabel(sheet.today, s.offset)}`} />
            ))}
          </CalRow>
          <CalRow name={`Occasions · ${calendar.occasions.length}`}>
            {calendar.occasions.map((o, i) => <Link key={i} href={`/bookings/${o.booking.id}`} className="q-mark q-mark-occasion" style={{ '--q-x': pct(o.offset) } as React.CSSProperties} title={`${o.booking.title} · ${o.label} · ${dayLabel(sheet.today, o.offset)}`} />)}
          </CalRow>
          <CalRow name={`Reminders · ${calendar.reminders.length}`}>
            {calendar.reminders.map((r, i) => <Link key={i} href={`/bookings/${r.booking.id}`} className={r.offset <= 0 ? 'q-mark q-mark-reminder q-mark-past' : 'q-mark q-mark-reminder'} style={{ '--q-x': pct(r.offset) } as React.CSSProperties} title={`${r.booking.title} · ${dayLabel(sheet.today, r.offset)}`} />)}
          </CalRow>
          <div className="q-cal-row">
            <span className="q-cal-name">Sessions per week</span>
            <span className="q-cal-bars">
              {calendar.perWeek.map((w) => {
                const max = Math.max(...calendar.perWeek.map((x) => x.count), 1);
                return <span key={w.from} className={w.ahead ? 'q-cal-bar q-cal-bar-ahead' : 'q-cal-bar'} style={{ '--q-share': Math.round((w.count / max) * 100) } as React.CSSProperties} title={`${w.count} · week of ${dayLabel(sheet.today, w.from)}`} />;
              })}
            </span>
          </div>
        </section>

        <div className="q-dash q-dash-wide">
          {/* PIPELINE */}
          <section className="q-card q-widget" aria-label="Pipeline">
            <header className="q-dash-head"><span className="q-dash-title">Pipeline</span><span className="q-dash-note">every strand, by the studio's stages · {total}</span></header>
            <div className="q-dist-bar" aria-hidden="true">
              {pipeline.map((s) => <span key={s.key || 'none'} className={`q-dist-seg q-dist-c-${s.look ? stageColor(s.look) : 'none'}`} style={{ '--q-share': s.count } as React.CSSProperties} title={`${s.label}: ${s.count}`} />)}
            </div>
            <ul className="q-pipe">
              {pipeline.map((s) => (
                <li key={s.key || 'none'} className="q-pipe-row">
                  <Link href={into({ stage: s.key || '__none__' })} className="q-pipe-name"><i className={`q-dist-dot q-dist-c-${s.look ? stageColor(s.look) : 'none'}`} />{s.label}</Link>
                  <b className="q-pipe-n">{s.count}</b>
                  <span className="q-pipe-share">{total > 0 ? Math.round((s.count / total) * 100) : 0}%</span>
                  <span className="q-pipe-note">
                    {s.kind === 'booked' && s.count > 0 && <span className="q-pipe-split">{s.ahead} ahead · {s.inPost} in post-production</span>}
                    {s.fact && <span className="q-pipe-fact">{s.kind === 'booked' && s.count > 0 ? ' · ' : ''}{s.fact.text}: <Link href={`/bookings/${s.fact.booking.id}`} className="q-plain-link q-pipe-who">{s.fact.booking.clientName ?? s.fact.booking.title}</Link></span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* THIS PERIOD */}
          <section className="q-card q-widget q-doing" aria-label={`The last ${sheet.period.days} days`}>
            <header className="q-dash-head q-doing-head">
              <span className="q-dash-title">This period</span>
              <nav className="q-seg" aria-label="Period">
                {PERIODS.map((p) => (
                  <Link key={p.days} href={withParams(q, { period: p.days === 30 ? null : String(p.days) })} className={p.days === periodDays ? 'q-seg-btn q-seg-on' : 'q-seg-btn'} aria-current={p.days === periodDays ? 'page' : undefined}>{p.days === 365 ? '1y' : `${p.days}d`}</Link>
                ))}
              </nav>
            </header>
            <div className="q-figures-row q-figures-four">
              {sheet.figures.map((f) => {
                const d = delta(f);
                const t = trend(f);
                return (
                  <div key={f.key} className="q-fig">
                    <span className="q-fig-label">{f.label}</span>
                    <span className="q-fig-main"><span className="q-fig-value">{say(f, f.value)}</span>{t && <Sparkline points={t} tone={d.dir} />}</span>
                    <span className={`q-fig-delta q-fig-${d.dir}`} title={d.title}><span className="q-fig-arrow" aria-hidden="true">{d.dir === 'up' ? '↑' : d.dir === 'down' ? '↓' : '→'}</span>{d.text} <span className="q-fig-vs">vs previous {sheet.period.days} days</span></span>
                    {f.note && <span className="q-fig-note">{f.note}</span>}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* RECENT ACTIVITY */}
        <section className="q-card q-widget q-widget-quiet" aria-label="Recent activity">
          <header className="q-dash-head"><span className="q-dash-title">Recent activity</span></header>
          {recent.length === 0 ? <p className="q-empty">No activity recorded.</p> : (
            <ul className="q-recent q-recent-grid">
              {recent.map((e) => (
                <li key={e.id} className="q-recent-row">
                  <span className="q-recent-text"><b>{e.who}</b> {e.booking ? e.phrase.replace(/\ba booking\b/, '') : e.phrase}{e.booking && <> <Link href={`/bookings/${e.booking.id}`} className="q-plain-link q-recent-what">{e.booking.title}</Link></>}</span>
                  <time className="q-recent-at" dateTime={e.at} title={new Date(e.at).toLocaleString('en-GB')}>{ago(e.at, now)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
