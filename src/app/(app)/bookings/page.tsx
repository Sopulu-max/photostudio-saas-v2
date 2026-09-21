import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudio } from '@/kernel/organizations';
import { readBookingsSheet, PERIODS, type Period, type Figure } from '@/modules/bookings/interface';
import { stageColor } from '@/components/stageBadge';
import { Donut, Series, Sparkline } from '@/components/Charts';
import { StorefrontLink } from '../packages/StorefrontLink';
import { BookingsDayBook } from './BookingsDayBook';

export const dynamic = 'force-dynamic';

/**
 * BOOKINGS, AS A DATA PAGE. Top to bottom, the way a studio reads its
 * business: the period, and four figures over it against the period
 * before; a year of one measure, month by month; every booking by the
 * studio's own stages; then the day book - every job, narrowed, grouped
 * and read (BookingsDayBook over components/Analysis).
 *
 * Everything arrives decided (readBookingsSheet): the figures, the series,
 * the breakdown, the axes. The page draws, and the view is the URL - the
 * period and the measure are links that keep the rest of the query, so a
 * narrowed sheet survives a change of period.
 */

type Query = Record<string, string | string[] | undefined>;

function withParams(q: Query, patch: Record<string, string | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (typeof v === 'string' && v) p.set(k, v);
  for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
  const s = p.toString();
  return s ? `/bookings?${s}` : '/bookings';
}

export default async function BookingsPage(props: { searchParams: Promise<Query> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const q = await props.searchParams;
  const periodDays = (PERIODS.find((p) => String(p.days) === q.period)?.days ?? 30) as Period;
  // One read, decided: the figures, the series, the breakdown, the bands, the axes.
  const [sheet, org] = await Promise.all([readBookingsSheet(periodDays), getStudio()]);
  const measure = sheet.series.lines.find((l) => l.key === q.measure) ?? sheet.series.lines[0];
  const say = (_f: Figure, n: number) => String(n);

  /*
   * A delta is the same measure over the period before, said as a change:
   * a percentage when the base is big enough for one to mean something
   * (five or more), else the difference itself - "+21" is a fact, "+2100%"
   * a noise. Up takes the green, down the warm colour, level neither.
   */
  const delta = (f: Figure) => {
    if (f.before === null) return null;
    const diff = f.value - f.before;
    const dir: 'up' | 'down' | 'flat' = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    const text = diff === 0 ? 'level' : f.before >= 5 ? `${sign}${Math.abs(Math.round((diff / f.before) * 100))}%` : `${sign}${say(f, Math.abs(diff))}`;
    return { dir, text, title: `${say(f, f.before)} the ${sheet.period.days} days before` };
  };
  const trend = (f: Figure) => sheet.series.lines.find((l) => l.key === f.key)?.points ?? null;

  // Of the live bookings, how many have a date - the one share worth a line here.
  const live = sheet.figures.find((f) => f.key === 'live')!.value;
  const undated = sheet.figures.find((f) => f.key === 'undated')!.value;
  const scheduled = live - undated;
  const month = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">Every job, the figures over the period, and where each has got to.</p>
        </div>
        <div className="q-row q-row-sm">
          <nav className="q-seg" aria-label="Period">
            {PERIODS.map((p) => (
              <Link key={p.days} href={withParams(q, { period: p.days === 30 ? null : String(p.days) })} className={p.days === periodDays ? 'q-seg-btn q-seg-on' : 'q-seg-btn'} aria-current={p.days === periodDays ? 'page' : undefined}>
                {p.days === 365 ? '1y' : `${p.days}d`}
              </Link>
            ))}
          </nav>
          <Link href="/bookings/settings" className="q-btn q-btn-secondary">Stages</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
      {/* THE FIGURES: four measures over the period, side by side, each against the period before. */}
      <section className="q-figures q-card" aria-label={`Figures for the last ${sheet.period.days} days`}>
        <div className="q-figures-row">
          {sheet.figures.map((f) => {
            const d = delta(f);
            return (
              <div key={f.key} className="q-fig">
                <span className="q-fig-label">{f.label}</span>
                <span className="q-fig-main">
                  <span className={f.key === 'undated' && f.value > 0 ? 'q-fig-value q-fig-warm' : 'q-fig-value'}>{say(f, f.value)}</span>
                  {trend(f) && <Sparkline points={trend(f)!} tone={d?.dir ?? 'flat'} />}
                </span>
                {d ? (
                  <span className={`q-fig-delta q-fig-${d.dir}`} title={d.title}>
                    <span className="q-fig-arrow" aria-hidden="true">{d.dir === 'up' ? '↑' : d.dir === 'down' ? '↓' : '→'}</span>
                    {d.text} <span className="q-fig-vs">vs the {sheet.period.days} before</span>
                  </span>
                ) : (
                  <span className="q-fig-delta q-fig-flat">{f.note}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="q-fig-line" aria-hidden="true"><i style={{ '--q-share': live > 0 ? Math.round((scheduled / live) * 100) : 0 } as React.CSSProperties} /></div>
        <div className="q-fig-foot">
          <span className="q-fig-foot-label">Of the live bookings, scheduled</span>
          <b>{live > 0 ? `${scheduled} of ${live} · ${Math.round((scheduled / live) * 100)}%` : '—'}</b>
        </div>
      </section>

      <div className="q-dash">
        {/* A YEAR OF ONE MEASURE, month by month; the measure is a link. */}
        <section className="q-card q-dash-series" aria-label="Twelve months">
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
        </section>

        {/* EVERY BOOKING BY STAGE - the studio's stages, its colours; a slice is a link into the sheet. */}
        <section className="q-card q-dash-stage" aria-label="By stage">
          <header className="q-dash-head">
            <span className="q-dash-title">By stage</span>
            <span className="q-dash-note">{sheet.byStage.reduce((n, s) => n + s.count, 0)} bookings</span>
          </header>
          <div className="q-dash-donut">
            <Donut slices={sheet.byStage.map((s) => ({ key: s.key || 'none', label: s.label, value: s.count, color: s.look ? stageColor(s.look) : 'none' }))} noun="booking" />
            <ul className="q-dash-legend">
              {sheet.byStage.map((s) => {
                const total = sheet.byStage.reduce((n, x) => n + x.count, 0);
                return (
                  <li key={s.key || 'none'}>
                    <Link href={withParams(q, { stage: s.key || '__none__' })} className="q-dash-key">
                      <i className={`q-dist-dot q-dist-c-${s.look ? stageColor(s.look) : 'none'}`} />
                      <span className="q-dash-key-label">{s.label}</span>
                      <b>{s.count}</b>
                      <span className="q-dash-key-share">{total > 0 ? Math.round((s.count / total) * 100) : 0}%</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>

      {/* The day book reads its view from the URL; the boundary is what useSearchParams asks for. */}
      <Suspense fallback={null}>
        <BookingsDayBook sheet={sheet} />
      </Suspense>

      {/* Public booking link - always visible so the studio can share it */}
      {org?.slug && (
        <div className="q-card q-row q-row-between">
          <div>
            <div className="q-strong">Public booking link</div>
            <div className="q-meta">Share this link so clients can book directly.</div>
          </div>
          <StorefrontLink slug={org.slug} path={`/book/${org.slug}/custom`} />
        </div>
      )}
      </div>
    </div>
  );
}
