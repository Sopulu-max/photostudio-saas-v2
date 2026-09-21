import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { readBookingsDashboard, PERIODS, type Period, type Figure, type NextRow, type Position } from '@/modules/bookings/interface';
import { stageBadgeClass, stageColor } from '@/components/stageBadge';
import { Series, Sparkline } from '@/components/Charts';
import { initialsFor } from '@/components/Sheet';
import { BookingsDayBook } from './BookingsDayBook';

export const dynamic = 'force-dynamic';

/**
 * BOOKINGS - the dashboard. The day's questions about bookings, in the
 * order a studio asks them, each answered with the bookings themselves:
 *
 *   Requires attention   - the edges a live booking has not yet grown: a
 *                          decision, a client, a date, a package, a crew.
 *   Today / Upcoming     - the sessions ahead: when, who, what each needs.
 *   Post-production      - sessions held with steps open, oldest first;
 *                          and those complete but not yet closed.
 *   Pipeline             - the studio's stages, with the fact that
 *                          matters for each kind.
 *   Recent activity      - the last events on bookings.
 *   This period          - four figures against the period before, and
 *                          twelve months of one of them. The period
 *                          control lives here, since only this obeys it.
 *
 * Then ALL BOOKINGS - the day book, on the same page, which every door
 * above opens on exactly its question. Everything arrives decided
 * (readBookingsDashboard); the page draws.
 */

type Query = Record<string, string | string[] | undefined>;

function withParams(q: Query, patch: Record<string, string | null>, hash = '') {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (typeof v === 'string' && v) p.set(k, v);
  for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
  const s = p.toString();
  return `/bookings${s ? `?${s}` : ''}${hash}`;
}

/** The day book below, opened on one question: only that question's selects, nothing else carried over. */
const into = (narrow: Record<string, string>) => `/bookings?${new URLSearchParams(narrow)}#all`;

const ago = (iso: string, now: number) => {
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
const dayWord = (b: { band: string; scheduledFor: string | null }) =>
  b.band === 'today' ? 'Today' : b.band === 'tomorrow' ? 'Tomorrow'
    : b.scheduledFor ? new Date(b.scheduledFor).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

/** A position, said: the service, its step, and who - "Unassigned" in the warm colour. */
function Where({ p }: { p: Position }) {
  return <>{p.service} · {p.step} · <span className={p.who ? '' : 'q-work-gap'}>{p.who ?? 'Unassigned'}</span></>;
}

/** A session row: time and day, the client's initials, the booking, what it needs or where it is, the stage. */
function SessionRow({ row: { booking: b, position } }: { row: NextRow }) {
  return (
    <Link href={`/bookings/${b.id}`} className={b.band === 'today' ? 'q-next-row q-next-today' : 'q-next-row'}>
      <span className="q-next-when">
        <b>{timeOf(b.scheduledFor)}</b>
        <small>{dayWord(b)}</small>
      </span>
      <span className="q-next-frame" aria-hidden="true">{initialsFor(b.clientName)}</span>
      <span className="q-next-body">
        <span className="q-next-title">{b.title}</span>
        <span className="q-next-pos">
          {position ? <Where p={position} /> : b.work && b.work.total > 0 ? 'All steps complete' : 'No steps defined'}
        </span>
      </span>
      {b.stage && <span className={`q-badge ${stageBadgeClass(b.stage as any)}`}>{b.stage.name}</span>}
    </Link>
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
  const { sheet, attention, today, week, later, works, toClose, pipeline, recent } = dash;
  const measure = sheet.series.lines.find((l) => l.key === q.measure) ?? sheet.series.lines[0];
  const now = Date.now();
  const total = pipeline.reduce((n, s) => n + s.count, 0);
  const needsAnything = attention.some((a) => a.count > 0);
  const todayDate = new Date(`${sheet.today}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  const say = (f: Figure, n: number) => (f.unit === 'percent' ? `${n}%` : String(n));
  const delta = (f: Figure) => {
    const diff = f.value - f.before;
    const dir: 'up' | 'down' | 'flat' = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    // A percentage of a base of five or more; else the difference itself. A rate's delta is in points.
    const text = diff === 0 ? 'unchanged'
      : f.unit === 'percent' ? `${sign}${Math.abs(diff)} pts`
      : f.before >= 5 ? `${sign}${Math.abs(Math.round((diff / f.before) * 100))}%` : `${sign}${Math.abs(diff)}`;
    return { dir, text, title: `${say(f, f.before)} in the previous ${sheet.period.days} days` };
  };
  const trend = (f: Figure) => sheet.series.lines.find((l) => l.key === f.key)?.points ?? null;
  const month = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">Attention items, upcoming sessions, post-production and the pipeline.</p>
        </div>
        <div className="q-row q-row-sm">
          <Link href="/bookings/settings" className="q-btn q-btn-secondary">Stages</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <div className="q-dash">
          {/* REQUIRES ATTENTION. Each absence, counted; each a door. */}
          <section className="q-card q-widget" aria-label="Requires attention">
            <header className="q-dash-head">
              <span className="q-dash-title">Requires attention</span>
              <span className="q-dash-note">{needsAnything ? `${attention.reduce((n, a) => n + a.count, 0)} items` : 'Nothing outstanding'}</span>
            </header>
            <ul className="q-att">
              {attention.map((a) => (
                <li key={a.key} className={a.count > 0 ? 'q-att-row' : 'q-att-row q-att-row-quiet'}>
                  {a.count > 0 ? (
                    <Link href={into(a.narrow)} className="q-att-link">
                      <b className="q-att-n q-att-n-live">{a.count}</b>
                      <span className="q-att-what">{a.label}{a.note && <span className="q-att-note"> · {a.note}</span>}</span>
                      <span className="q-att-go" aria-hidden="true">→</span>
                    </Link>
                  ) : (
                    <span className="q-att-link">
                      <b className="q-att-n">0</b>
                      <span className="q-att-what">{a.label}</span>
                    </span>
                  )}
                  {a.count > 0 && (
                    <span className="q-att-sample">
                      {a.sample.map((b) => (
                        <Link key={b.id} href={`/bookings/${b.id}`} className="q-att-chip">{b.clientName ?? b.title}</Link>
                      ))}
                      {a.count > a.sample.length && <span className="q-att-more">+{a.count - a.sample.length}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* TODAY, then UPCOMING. */}
          <section className="q-card q-widget" aria-label="Sessions">
            <header className="q-dash-head">
              <span className="q-dash-title">Today</span>
              <span className="q-dash-note">{todayDate}</span>
            </header>
            {today.length === 0
              ? <p className="q-empty">No sessions today.</p>
              : <ul className="q-next">{today.map((r) => <li key={r.booking.id}><SessionRow row={r} /></li>)}</ul>}
            <header className="q-dash-head q-dash-head-again">
              <span className="q-dash-title">{later.length > 0 ? 'Upcoming' : 'Rest of this week'}</span>
              <Link href={into({ when: later.length > 0 ? 'later' : 'week' })} className="q-dash-note q-plain-link">View all →</Link>
            </header>
            {week.length === 0 && later.length === 0
              ? <p className="q-empty">No further sessions scheduled this week.</p>
              : <ul className="q-next">{(week.length > 0 ? week : later).map((r) => <li key={r.booking.id}><SessionRow row={r} /></li>)}</ul>}
          </section>
        </div>

        <div className="q-dash q-dash-wide">
          {/* POST-PRODUCTION. Sessions held, steps open - oldest first; then those complete but not closed. */}
          <section className="q-card q-widget" aria-label="Post-production">
            <header className="q-dash-head">
              <span className="q-dash-title">Post-production</span>
              <span className="q-dash-note">{works.length} in progress{toClose.length > 0 ? ` · ${toClose.length} ready to close` : ''}</span>
            </header>
            {works.length === 0 && toClose.length === 0 ? (
              <p className="q-empty">No sessions awaiting post-production.</p>
            ) : (
              <ul className="q-next">
                {works.map(({ booking: b, since, open, done, total: t }) => (
                  <li key={b.id}>
                    <Link href={`/bookings/${b.id}#work`} className="q-next-row">
                      <span className="q-next-when">
                        <b>{since}d</b>
                        <small>since session</small>
                      </span>
                      <span className="q-next-frame" aria-hidden="true">{initialsFor(b.clientName)}</span>
                      <span className="q-next-body">
                        <span className="q-next-title">{b.title}</span>
                        <span className="q-next-pos">
                          {open.slice(0, 2).map((p, i) => <span key={i}>{i > 0 ? ' · ' : ''}<Where p={p} /></span>)}
                          {open.length > 2 && <span className="q-att-more"> +{open.length - 2}</span>}
                        </span>
                      </span>
                      <span className="q-cell-progress" title={`${done} of ${t} steps complete`}>
                        <span className="q-sheet-band-bar"><i className="q-dist-c-blue" style={{ '--q-share': Math.round((done / t) * 100) } as React.CSSProperties} /></span>
                        <span className="q-cell-mono">{done}/{t}</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {toClose.map((b) => (
                  <li key={b.id}>
                    <Link href={`/bookings/${b.id}`} className="q-next-row q-next-row-dim">
                      <span className="q-next-when"><b>Done</b><small>ready to close</small></span>
                      <span className="q-next-frame" aria-hidden="true">{initialsFor(b.clientName)}</span>
                      <span className="q-next-body">
                        <span className="q-next-title">{b.title}</span>
                        <span className="q-next-pos">All steps complete · move to a closed stage</span>
                      </span>
                      {b.stage && <span className={`q-badge ${stageBadgeClass(b.stage as any)}`}>{b.stage.name}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* PIPELINE. The studio's stages; each a door; the fact for its kind. */}
          <section className="q-card q-widget" aria-label="Pipeline">
            <header className="q-dash-head">
              <span className="q-dash-title">Pipeline</span>
              <span className="q-dash-note">{total} booking{total === 1 ? '' : 's'}</span>
            </header>
            <div className="q-dist-bar" aria-hidden="true">
              {pipeline.map((s) => (
                <span key={s.key || 'none'} className={`q-dist-seg q-dist-c-${s.look ? stageColor(s.look) : 'none'}`} style={{ '--q-share': s.count } as React.CSSProperties} title={`${s.label}: ${s.count}`} />
              ))}
            </div>
            <ul className="q-pipe">
              {pipeline.map((s) => (
                <li key={s.key || 'none'} className="q-pipe-row">
                  <Link href={into({ stage: s.key || '__none__' })} className="q-pipe-name">
                    <i className={`q-dist-dot q-dist-c-${s.look ? stageColor(s.look) : 'none'}`} />
                    {s.label}
                  </Link>
                  <b className="q-pipe-n">{s.count}</b>
                  <span className="q-pipe-share">{total > 0 ? Math.round((s.count / total) * 100) : 0}%</span>
                  <span className="q-pipe-note">
                    {s.kind === 'booked' && s.count > 0 && <span className="q-pipe-split">{s.ahead} ahead · {s.inPost} in post-production</span>}
                    {s.fact && (
                      <span className="q-pipe-fact">
                        {s.kind === 'booked' && s.count > 0 ? ' · ' : ''}
                        {s.fact.text}: <Link href={`/bookings/${s.fact.booking.id}`} className="q-plain-link q-pipe-who">{s.fact.booking.clientName ?? s.fact.booking.title}</Link>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="q-dash q-dash-wide">
          {/* THIS PERIOD. Four figures against the period before; a year of one. The period control lives here. */}
          <section className="q-card q-widget q-doing" aria-label={`The last ${sheet.period.days} days`}>
            <header className="q-dash-head q-doing-head">
              <span className="q-dash-title">This period</span>
              <nav className="q-seg" aria-label="Period">
                {PERIODS.map((p) => (
                  <Link key={p.days} href={withParams(q, { period: p.days === 30 ? null : String(p.days) })} className={p.days === periodDays ? 'q-seg-btn q-seg-on' : 'q-seg-btn'} aria-current={p.days === periodDays ? 'page' : undefined}>
                    {p.days === 365 ? '1y' : `${p.days}d`}
                  </Link>
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
                    <span className="q-fig-main">
                      <span className="q-fig-value">{say(f, f.value)}</span>
                      {t && <Sparkline points={t} tone={d.dir} />}
                    </span>
                    <span className={`q-fig-delta q-fig-${d.dir}`} title={d.title}>
                      <span className="q-fig-arrow" aria-hidden="true">{d.dir === 'up' ? '↑' : d.dir === 'down' ? '↓' : '→'}</span>
                      {d.text} <span className="q-fig-vs">vs previous {sheet.period.days} days</span>
                    </span>
                    {f.note && <span className="q-fig-note">{f.note}</span>}
                  </div>
                );
              })}
            </div>
            <div className="q-doing-series">
              <header className="q-dash-head">
                <span className="q-dash-title">Twelve months</span>
                <nav className="q-seg" aria-label="Measure">
                  {sheet.series.lines.map((l) => (
                    <Link key={l.key} href={withParams(q, { measure: l.key === sheet.series.lines[0].key ? null : l.key })} className={l.key === measure.key ? 'q-seg-btn q-seg-on' : 'q-seg-btn'} aria-current={l.key === measure.key ? 'page' : undefined}>
                      {l.label}
                    </Link>
                  ))}
                </nav>
              </header>
              <Series points={measure.points} labels={sheet.series.months.map(month)} />
            </div>
          </section>

          {/* RECENT ACTIVITY. */}
          <section className="q-card q-widget" aria-label="Recent activity">
            <header className="q-dash-head">
              <span className="q-dash-title">Recent activity</span>
            </header>
            {recent.length === 0 ? (
              <p className="q-empty">No activity recorded.</p>
            ) : (
              <ul className="q-recent">
                {recent.map((e) => (
                  <li key={e.id} className="q-recent-row">
                    <span className="q-recent-text">
                      <b>{e.who}</b> {e.booking ? e.phrase.replace(/\ba booking\b/, '') : e.phrase}
                      {e.booking && <> <Link href={`/bookings/${e.booking.id}`} className="q-plain-link q-recent-what">{e.booking.title}</Link></>}
                    </span>
                    <time className="q-recent-at" dateTime={e.at} title={new Date(e.at).toLocaleString('en-GB')}>{ago(e.at, now)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ALL BOOKINGS - the day book, for every other question. */}
        <section id="all" aria-label="All bookings" className="q-stack q-stack-sm">
          <h2 className="q-section-title">All bookings</h2>
          <Suspense fallback={null}>
            <BookingsDayBook sheet={sheet} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
