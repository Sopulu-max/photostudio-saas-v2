import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  readBookingsRegister, readBookingsDashboard, PERIODS,
  type Period, type RegisterRow,
} from '@/modules/bookings/interface';
import { readBookingsMonth } from '@/modules/bookings/month';
import { cardName, cardWhat, cardWhen, cardNeeds } from '@/modules/bookings/say';
import { Board, type BoardCard } from '@/components/Board';
import { CutBar } from './CutBar';
import { Register } from './Register';
import { Outstanding, Calendar, Distribution } from './Views';

export const dynamic = 'force-dynamic';

/**
 * BOOKINGS - one set of rows, one cut, five presentations.
 *
 * Nothing is forced into a single view and nothing sits above them all: the
 * page is the tab bar, the cut every tab shares, and one reading at a time.
 * The tabs are not a menu somebody chose - each is the presentation that one
 * shape of reading justifies (12-BOOKINGS_READABILITY §3), and the
 * deconstruction produces exactly five:
 *
 *   register      names and typed values, per booking → rows and columns
 *   outstanding   presence and absence → a worklist, by consequence
 *   calendar      points in time → the studio's own days, and the window
 *   board         membership of a category → columns of cards
 *   distribution  proportion, and counts over a window → shares and a trend
 *
 * The event trace is not among them: a trace is a reading of events, not of
 * bookings, and it belongs on the booking it happened to.
 *
 * THE CUT IS APPLIED HERE, once, before any view draws - so narrowing to the
 * bookings with no session date and then switching to Distribution shows what
 * those bookings are made of. The tab, the cut, the grouping, the sort and the
 * month are all in the URL, so a reading is a link and the back button works.
 *
 * Money is not on this page: value and settlement are reported in Finances.
 */

type Query = Record<string, string | string[] | undefined>;
/** The page's own parameters. Every other parameter in the URL is a cut on an axis. */
const OWN = new Set(['view', 'group', 'sort', 'period', 'board', 'month']);
const VIEWS = ['register', 'outstanding', 'calendar', 'board', 'distribution'] as const;
type View = (typeof VIEWS)[number];
const LABEL: Record<View, string> = {
  register: 'Register', outstanding: 'Outstanding', calendar: 'Calendar', board: 'Board', distribution: 'Distribution',
};

export default async function BookingsPage(props: { searchParams: Promise<Query> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const params = await props.searchParams;
  const q: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && v) q[k] = v;

  const view: View = (VIEWS as readonly string[]).includes(q.view ?? '') ? (q.view as View) : 'register';
  const periodDays = (PERIODS.find((p) => String(p.days) === q.period)?.days ?? 30) as Period;

  const [{ sheet, rows }, dash, month] = await Promise.all([
    readBookingsRegister(periodDays),
    readBookingsDashboard(periodDays),
    view === 'calendar' ? readBookingsMonth(q.month) : Promise.resolve(null),
  ]);

  /** One URL shape for every control: patch what changes, keep the rest. */
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return `/bookings${s ? `?${s}` : ''}`;
  };

  // ---- THE CUT, applied once for every view.
  const cuts = sheet.lenses.map((g) => ({ g, value: q[g.key] })).filter((x) => Boolean(x.value));
  const cut = rows.filter((r) =>
    cuts.every(({ g, value }) => {
      const takes = r.takes[g.key] ?? [];
      /*
       * Three ways to narrow on an axis: to one of its values, to the rows
       * that take none of them (__none__), or to the rows that take ANY of
       * them (__any__) - which is what "unresolved" means on the absence
       * axis, where the question is whether anything is missing at all
       * rather than which thing.
       */
      if (value === '__none__') return takes.length === 0;
      if (value === '__any__') return takes.length > 0;
      return takes.includes(value!);
    }));
  const live = cut.filter((r) => r.band !== 'closed');

  // ---- the saved cuts: values of an axis, each with its own count over the whole book
  const countOf = (axis: string, value: string) =>
    rows.filter((r) => (value === '__none__' ? (r.takes[axis] ?? []).length === 0 : (r.takes[axis] ?? []).includes(value))).length;
  const unresolved = rows.filter((r) => (r.takes.missing ?? []).length > 0).length;
  const saved = [
    { key: 'all', label: 'Everything', count: rows.length, href: href(Object.fromEntries(sheet.lenses.map((g) => [g.key, null]))), on: cuts.length === 0 },
    { key: 'unresolved', label: 'Unresolved', count: unresolved, href: href({ ...Object.fromEntries(sheet.lenses.map((g) => [g.key, null])), missing: '__any__' }), on: q.missing === '__any__' },
    { key: 'awaiting', label: 'Awaiting client', count: countOf('missing', 'decision-client'), href: href({ ...Object.fromEntries(sheet.lenses.map((g) => [g.key, null])), missing: 'decision-client' }), on: q.missing === 'decision-client' },
    { key: 'unscheduled', label: 'Not scheduled', count: countOf('missing', 'date'), href: href({ ...Object.fromEntries(sheet.lenses.map((g) => [g.key, null])), missing: 'date' }), on: q.missing === 'date' },
    { key: 'behind', label: 'Behind', count: countOf('when', 'earlier'), href: href({ ...Object.fromEntries(sheet.lenses.map((g) => [g.key, null])), when: 'earlier' }), on: q.when === 'earlier' },
  ].filter((v) => v.count > 0 || v.key === 'all');

  // ---- what each view needs, decided here
  const committed = (() => {
    const sum = new Map<string, { quantity: number; extra: number; undecided: number }>();
    for (const r of live) for (const c of r.committed) {
      const had = sum.get(c.deliverable) ?? { quantity: 0, extra: 0, undecided: 0 };
      had.quantity += c.quantity; had.extra += c.extra; had.undecided += c.undecided ? 1 : 0;
      sum.set(c.deliverable, had);
    }
    return [...sum.entries()].map(([deliverable, v]) => ({ deliverable, ...v }))
      .sort((a, b) => b.quantity + b.extra - (a.quantity + a.extra));
  })();

  const narrowTo: Record<string, string> = {};
  for (const g of sheet.lenses) {
    for (const it of g.items) narrowTo[`${g.key}:${it.key}`] = href({ [g.key]: it.key });
    if (g.none) narrowTo[`${g.key}:__none__`] = href({ [g.key]: '__none__' });
  }

  const boardKey = q.board ?? 'stage';
  const boardAxis = sheet.lenses.find((g) => g.key === boardKey) ?? sheet.lenses.find((g) => g.key === 'stage') ?? sheet.lenses[0] ?? null;
  const boardCards: BoardCard[] = live.map((r) => ({
    id: r.id, takes: r.takes, name: cardName(r), what: cardWhat(r),
    when: cardWhen(r, sheet.today), behind: r.day !== null && r.day < sheet.today, now: r.day === sheet.today,
    needs: cardNeeds(r), work: r.work && r.work.total > 0 ? { done: r.work.done, total: r.work.total } : null,
  }));

  // The window and the undated count follow the cut, so the calendar reads the same set as the table.
  const inCut = new Set(cut.map((r) => r.id));
  const strip = dash.dated.columns.map((c) => ({ ...c }));
  const undatedInCut = live.filter((r) => r.day === null).length;

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
          <Link key={v} href={href({ view: v === 'register' ? null : v })} className={view === v ? 'q-tab q-tab-on' : 'q-tab'}>
            {LABEL[v]}
          </Link>
        ))}
      </div>

      <Suspense fallback={null}>
        <CutBar lenses={sheet.lenses} q={q} saved={saved} shown={cut.length} total={rows.length} />
      </Suspense>

      <section className="q-view">
        {view === 'register' && (
          <Suspense fallback={null}>
            <Register rows={cut} lenses={sheet.lenses} q={q} today={sheet.today} />
          </Suspense>
        )}

        {view === 'outstanding' && <Outstanding rows={live} today={sheet.today} />}

        {view === 'calendar' && month && (
          <Calendar
            month={month}
            rows={live}
            strip={strip}
            weeks={dash.dated.weeks}
            undated={undatedInCut}
            undatedHref={href({ missing: 'date', view: 'register' })}
            previousHref={href({ month: month.previous })}
            nextHref={href({ month: month.next })}
            todayHref={href({ month: null })}
          />
        )}

        {view === 'board' && boardAxis && (
          <Board
            axis={boardAxis}
            cards={boardCards}
            axes={sheet.lenses.filter((g) => g.items.length > 1 || g.none).map((g) => ({
              key: g.key, label: g.label, href: href({ board: g.key === 'stage' ? null : g.key }), on: g.key === boardAxis.key,
            }))}
            hrefFor={(c) => `/bookings/${c.id}`}
            cutFor={(itemKey) => href({ [boardAxis.key]: itemKey })}
          />
        )}

        {view === 'distribution' && (
          <Distribution
            rows={live}
            lenses={sheet.lenses}
            figures={sheet.figures}
            months={sheet.series.months}
            series={sheet.series.lines}
            periodDays={sheet.period.days}
            narrowTo={narrowTo}
            committed={committed}
          />
        )}
      </section>
    </div>
  );
}
