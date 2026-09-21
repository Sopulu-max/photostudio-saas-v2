import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { readBookingsDashboard, PERIODS, type Period, type Figure } from '@/modules/bookings/interface';
import { stageBadgeClass, stageColor } from '@/components/stageBadge';
import { Series, Sparkline } from '@/components/Charts';
import { initialsFor } from '@/components/Sheet';

export const dynamic = 'force-dynamic';

/**
 * BOOKINGS - the dashboard. The day's questions about bookings, in the
 * order a studio asks them, each answered with the bookings themselves:
 *
 *   What needs me?       - four conditions of the ontology, counted and
 *                          sampled, each a door into the day book.
 *   What is next?        - the week's sessions: when, who, where the work
 *                          is, who is on it.
 *   Where is everything? - the studio's stages, each with who is next and
 *                          who has waited longest.
 *   What just changed?   - the last events on bookings.
 *   How are we doing?    - two figures over the period against the period
 *                          before, and twelve months of one of them.
 *
 * The day book - every booking, narrowed, grouped, read - is its own page
 * (/bookings/all), which every door here opens on exactly its question.
 * Everything arrives decided (readBookingsDashboard); the page draws. The
 * period and the measure are links that keep the rest of the query.
 */

type Query = Record<string, string | string[] | undefined>;

function withParams(q: Query, patch: Record<string, string | null>, hash = '') {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (typeof v === 'string' && v) p.set(k, v);
  for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
  const s = p.toString();
  return `/bookings${s ? `?${s}` : ''}${hash}`;
}

/** The day book, opened on one question: only that question's selects, nothing else carried over. */
const into = (narrow: Record<string, string>) => `/bookings/all?${new URLSearchParams(narrow)}`;

const ago = (iso: string, now: number) => {
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

export default async function BookingsPage(props: { searchParams: Promise<Query> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const q = await props.searchParams;
  const periodDays = (PERIODS.find((p) => String(p.days) === q.period)?.days ?? 30) as Period;
  const dash = await readBookingsDashboard(periodDays);
  const { sheet, attention, upNext, pipeline, recent } = dash;
  const measure = sheet.series.lines.find((l) => l.key === q.measure) ?? sheet.series.lines[0];
  const now = Date.now();
  const total = pipeline.reduce((n, s) => n + s.count, 0);
  const needsAnything = attention.some((a) => a.count > 0);

  const delta = (f: Figure) => {
    if (f.before === null) return null;
    const diff = f.value - f.before;
    const dir: 'up' | 'down' | 'flat' = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    const text = diff === 0 ? 'level' : f.before >= 5 ? `${sign}${Math.abs(Math.round((diff / f.before) * 100))}%` : `${sign}${Math.abs(diff)}`;
    return { dir, text, title: `${f.before} the ${sheet.period.days} days before` };
  };
  const trend = (f: Figure) => sheet.series.lines.find((l) => l.key === f.key)?.points ?? null;
  const month = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const dayWord = (b: { band: string; scheduledFor: string | null }) =>
    b.band === 'today' ? 'Today' : b.band === 'tomorrow' ? 'Tomorrow'
      : b.scheduledFor ? new Date(b.scheduledFor).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
  const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">What needs you, what is next, where everything is.</p>
        </div>
        <div className="q-row q-row-sm">
          <nav className="q-seg" aria-label="Period">
            {PERIODS.map((p) => (
              <Link key={p.days} href={withParams(q, { period: p.days === 30 ? null : String(p.days) })} className={p.days === periodDays ? 'q-seg-btn q-seg-on' : 'q-seg-btn'} aria-current={p.days === periodDays ? 'page' : undefined}>
                {p.days === 365 ? '1y' : `${p.days}d`}
              </Link>
            ))}
          </nav>
          <Link href="/bookings/all" className="q-btn q-btn-secondary">All bookings</Link>
          <Link href="/bookings/settings" className="q-btn q-btn-secondary">Stages</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <div className="q-dash">
          {/* WHAT NEEDS ME. Four conditions, counted; each a door. */}
          <section className="q-card q-widget" aria-label="What needs you">
            <header className="q-dash-head">
              <span className="q-dash-title">Needs you</span>
              {!needsAnything && <span className="q-dash-note">Nothing waiting</span>}
            </header>
            <ul className="q-att">
              {attention.map((a) => {
                const body = (
                  <>
                    <b className={a.count > 0 ? 'q-att-n q-att-n-live' : 'q-att-n'}>{a.count}</b>
                    <span className="q-att-what">
                      {a.label}
                      {a.note && <span className="q-att-note"> · {a.note}</span>}
                    </span>
                    {a.count > 0 && a.narrow && <span className="q-att-go" aria-hidden="true">→</span>}
                  </>
                );
                return (
                  <li key={a.key} className={a.count > 0 ? 'q-att-row' : 'q-att-row q-att-row-quiet'}>
                    {a.count > 0 && a.narrow ? <Link href={into(a.narrow)} className="q-att-link">{body}</Link> : <span className="q-att-link">{body}</span>}
                    {a.count > 0 && (
                      <span className="q-att-sample">
                        {a.sample.map((b) => (
                          <Link key={b.id} href={`/bookings/${b.id}`} className="q-att-chip">{b.clientName ?? b.title}</Link>
                        ))}
                        {a.count > a.sample.length && <span className="q-att-more">+{a.count - a.sample.length}</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* WHAT IS NEXT. The week's sessions, soonest first; when the week is empty, what follows it. */}
          <section className="q-card q-widget" aria-label="Up next">
            <header className="q-dash-head">
              <span className="q-dash-title">Up next</span>
              <Link href={into({ when: 'week' })} className="q-dash-note q-plain-link">This week →</Link>
            </header>
            {upNext.length === 0 ? (
              <p className="q-empty">Nothing scheduled ahead.</p>
            ) : (
              <ul className="q-next">
                {upNext.map(({ booking: b, position }) => (
                  <li key={b.id}>
                    <Link href={`/bookings/${b.id}`} className={b.band === 'today' ? 'q-next-row q-next-today' : 'q-next-row'}>
                      <span className="q-next-when">
                        <b>{timeOf(b.scheduledFor)}</b>
                        <small>{dayWord(b)}</small>
                      </span>
                      <span className="q-next-frame" aria-hidden="true">{initialsFor(b.clientName)}</span>
                      <span className="q-next-body">
                        <span className="q-next-title">{b.title}</span>
                        <span className="q-next-pos">
                          {position
                            ? <>{position.service} · {position.step} · <span className={position.who ? '' : 'q-work-gap'}>{position.who ?? 'nobody'}</span></>
                            : b.work && b.work.total > 0 ? 'Work done' : 'No steps yet'}
                        </span>
                      </span>
                      {b.stage && <span className={`q-badge ${stageBadgeClass(b.stage as any)}`}>{b.stage.name}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="q-dash q-dash-wide">
          {/* WHERE EVERYTHING IS. The studio's stages; each a door. */}
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
                    {s.next
                      ? <>next <Link href={`/bookings/${s.next.id}`} className="q-plain-link q-pipe-who">{s.next.clientName ?? s.next.title}</Link>, {dayWord(s.next)}</>
                      : s.oldest
                        ? <>longest here <Link href={`/bookings/${s.oldest.booking.id}`} className="q-plain-link q-pipe-who">{s.oldest.booking.clientName ?? s.oldest.booking.title}</Link>, {s.oldest.days}d</>
                        : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* WHAT JUST CHANGED. */}
          <section className="q-card q-widget" aria-label="Recently">
            <header className="q-dash-head">
              <span className="q-dash-title">Recently</span>
            </header>
            {recent.length === 0 ? (
              <p className="q-empty">Nothing yet.</p>
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

        {/* HOW WE ARE DOING. Two figures over the period, and a year of one of them. */}
        <section className="q-card q-widget q-doing" aria-label={`Over the last ${sheet.period.days} days`}>
          <div className="q-figures-row q-figures-two">
            {sheet.figures.filter((f) => f.before !== null).map((f) => {
              const d = delta(f);
              return (
                <div key={f.key} className="q-fig">
                  <span className="q-fig-label">{f.label} · {sheet.period.days}d</span>
                  <span className="q-fig-main">
                    <span className="q-fig-value">{f.value}</span>
                    {trend(f) && <Sparkline points={trend(f)!} tone={d?.dir ?? 'flat'} />}
                  </span>
                  {d && (
                    <span className={`q-fig-delta q-fig-${d.dir}`} title={d.title}>
                      <span className="q-fig-arrow" aria-hidden="true">{d.dir === 'up' ? '↑' : d.dir === 'down' ? '↓' : '→'}</span>
                      {d.text} <span className="q-fig-vs">vs the {sheet.period.days} before</span>
                    </span>
                  )}
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
      </div>
    </div>
  );
}
