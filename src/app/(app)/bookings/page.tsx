import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  readBookingsDashboard, PERIODS,
  sayNeeds, sayWait, saySession, sayWork, sayProgress, sayDay, sayAge, plural,
  cardName, cardWhat, cardWhen, cardNeeds,
  type Period, type Say, type SheetBooking, type NextRow,
} from '@/modules/bookings/interface';
import { sayAbsence, is, verb, them, a as article } from '@/modules/bookings/say';
import { Days, Share, Progress, Counts, Trend } from '@/components/Readings';
import { Board, type BoardCard } from '@/components/Board';
import { BookingsDayBook } from './BookingsDayBook';

export const dynamic = 'force-dynamic';

/**
 * BOOKINGS - one page at two levels, and everything on it is a statement
 * (12-BOOKINGS_READABILITY; the design canvas, board 8).
 *
 * The page carries no key and no labels, because nothing on it is a mark: a
 * verb says which plane a reading comes from, a numeral carries the noun it
 * counts, an absence is a clause. Each region begins from a question the
 * operator actually asks (§0.2) and says so in its own head; a region that
 * answers none does not exist, and neither does a count nobody can act on
 * (Law 7 - which is why there is no "reminders 0" anywhere here).
 *
 * THE SUMMARY LEVEL, at /bookings, answers in order: what is happening today ·
 * what each job still needs · where the work is · when everything is · what
 * the book has sold and what nobody answered · what it is for · where the
 * studio says everything is · how the book moved and what changed.
 *
 * WHERE EVERYTHING SITS opens the page, because "where is everything" is read
 * spatially or not at all: a column per value of an axis, a card per job, so
 * the column's height is how much of the book sits there and an empty column
 * is a value nothing is at (components/Board). The AXIS IS CHOSEN - stage,
 * when, what a job needs, what is missing, or any dimension the studio
 * defined - because across bookings no grouping is the hierarchy (doc 11 §4);
 * ?board=<axis> carries the choice.
 *
 * WHAT IS STILL DRAWN, and why (Law 4, components/Readings): the four
 * readings whose GEOMETRY IS THE FACT - days on a dated axis (a collision, a
 * quiet week), length as a share of the whole (which way the book leans),
 * length as progress, slope as direction over months. Each carries its own
 * dates, words and numbers, so none of them needs a key. Everything else is
 * a sentence.
 *
 * THE ROWS LEVEL, at /bookings?<axes>, is one cut: its definition once, then
 * the instrument, where a chosen cut may tabulate because the operator's own
 * act gave the columns their subject.
 *
 * Everything arrives decided (readBookingsDashboard, say.ts); the page draws.
 */

type Query = Record<string, string | string[] | undefined>;
const OWN = new Set(['period', 'board']);

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
  if (m < 1) return 'a moment ago';
  if (m < 60) return `${plural(m, 'minute')} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${plural(h, 'hour')} ago`;
  return `${plural(Math.round(h / 24), 'day')} ago`;
};

/* The order a job resolves its absences, so the jobs that need most come first. */
const RESOLVE = ['lapsed', 'decision-studio', 'reminder', 'client', 'package', 'date', 'classification', 'crew', 'decision-client'];
function firstGap(r: SheetBooking) {
  const idx = (r.takes.missing ?? []).map((k) => RESOLVE.indexOf(k)).filter((i) => i >= 0);
  return idx.length > 0 ? Math.min(...idx) : RESOLVE.length;
}

/** A statement, drawn: the words, with the fragments that need the operator warm. */
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

/** A region: the questions it answers, said in its own head. */
function Region({ title, answers, children, right }: { title: string; answers: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="q-region">
      <div className="q-region-head">
        <div>
          <h2 className="q-region-title">{title}</h2>
          <p className="q-region-answers">{answers}</p>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/**
 * One job: the statement, and where a quantity is worth comparing down the
 * region, the one drawing that carries it (progress). Nothing here stands for
 * a fact that is not also said.
 */
function Job({ id, name, say, tail, badge, tint, draw }: { id: string; name: string; say: Say; tail?: string | null; badge?: React.ReactNode; tint?: boolean; draw?: React.ReactNode }) {
  return (
    <Link href={`/bookings/${id}`} className={tint ? 'q-job q-job-now' : 'q-job'}>
      <span className="q-job-body">
        <span className="q-job-name">{name}</span>
        <span className="q-job-said"><Said say={say} /></span>
      </span>
      {(tail || badge || draw) && (
        <span className="q-job-tail">
          {draw}
          {tail && <span className="q-job-figure">{tail}</span>}
          {badge}
        </span>
      )}
    </Link>
  );
}

/** A sentence that is also a door: the region's own totals. */
function Total({ say, href }: { say: Say; href?: string }) {
  const body = <Said say={say} />;
  return href ? <Link href={href} className="q-total-said">{body}</Link> : <p className="q-total-said">{body}</p>;
}

function Stage({ r }: { r: SheetBooking }) {
  if (!r.stage) return null;
  return <span className="q-job-stage">{r.stage.name}</span>;
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
  const { sheet, attention, roleTotals, dated, sold, forDimensions, decision, today, week, later, works, toClose, pipeline, recent } = dash;
  const now = Date.now();
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
            <p className="q-page-subtitle">
              {setAxes.length > 0
                ? 'One cut of the book. You chose it, so the columns below can compare it.'
                : 'Every booking — narrow it, group it, read it.'}
            </p>
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
  const todayDate = new Date(`${sheet.today}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const withGap = live.filter((r) => (r.takes.missing ?? []).length > 0)
    .sort((a, b) => firstGap(a) - firstGap(b) || a.createdAt.localeCompare(b.createdAt));
  const oldest = [...live].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  const shownGaps = withGap.slice(0, 5);
  const inPost = works.length;

  // The one sentence the whole page is a reading of: what today is.
  const headline: Say = [];
  if (today.length > 0) {
    const said = today
      .map((n) => `${n.booking.clientName ?? n.booking.title}${n.booking.scheduledFor ? ` at ${new Date(n.booking.scheduledFor).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`)
      .join(', ');
    headline.push({ t: `${plural(today.length, 'session')} today:`, tone: 'strong' }, { t: `${said}.` });
  } else {
    headline.push({ t: 'Nothing is shot today.' });
    const next = week[0] ?? later[0];
    if (next?.booking.day) headline.push({ t: `The next session is ${next.booking.clientName ?? next.booking.title}'s, ${sayDay(next.booking.day, sheet.today)}.` });
  }
  if (inPost > 0) headline.push({ t: `${plural(inPost, 'job')} ${inPost === 1 ? 'is' : 'are'} in post-production.` });
  if (dated.undated > 0) headline.push({ t: `Of ${plural(live.length, 'live job')},` }, { t: `${dated.undated} have no session date at all`, tone: 'warm' });
  /* The count the region below shows, from the same source: one fact, one number on the page. */
  const waitingOnClient = attention.find((x) => x.key === 'decision-client')?.count ?? 0;
  if (waitingOnClient > 0) headline.push({ t: `and ${waitingOnClient} ${is(waitingOnClient)} waiting on a client to agree a proposal.`, tone: 'warm' });

  /*
   * THE BOARD'S AXIS: the operator's, from the same axes the instrument groups
   * by. Stage is only the default because it is the one the studio declares by
   * hand; nothing in the page privileges it beyond that.
   */
  const boardKey = typeof q.board === 'string' && q.board ? q.board : 'stage';
  const boardAxis = sheet.lenses.find((g) => g.key === boardKey) ?? sheet.lenses.find((g) => g.key === 'stage') ?? sheet.lenses[0] ?? null;
  const boardAxes = sheet.lenses
    .filter((g) => g.items.length > 1 || g.none)
    .map((g) => ({ key: g.key, label: g.label, href: withParams(q, { board: g.key === 'stage' ? null : g.key }), on: g.key === boardAxis?.key }));
  const boardCards: BoardCard[] = live.map((r) => ({
    id: r.id,
    takes: r.takes,
    name: cardName(r),
    what: cardWhat(r),
    when: cardWhen(r, sheet.today),
    behind: r.day !== null && r.day < sheet.today,
    now: r.day === sheet.today,
    needs: cardNeeds(r),
    work: r.work && r.work.total > 0 ? { done: r.work.done, total: r.work.total } : null,
  }));

  const periodControl = (
    <div className="q-seg q-seg-sm">
      {PERIODS.map((p) => (
        <Link key={p.days} href={withParams(q, { period: p.days === 30 ? null : String(p.days) })} className={p.days === sheet.period.days ? 'q-seg-btn q-seg-on' : 'q-seg-btn'}>
          {p.days === 365 ? '1y' : `${p.days}d`}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="q-read">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">{todayDate}</p>
        </div>
        <div className="q-row q-row-sm">
          <Link href="/bookings/settings/stages" className="q-btn q-btn-ghost">Stages</Link>
          <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
        </div>
      </header>

      <p className="q-headline-said"><Said say={headline} /> <Link href="/bookings?all=1" className="q-headline-door">All {live.length} →</Link></p>

      {boardAxis && (
        <Region
          title="Where everything sits"
          answers={`every live job, grouped by ${boardAxis.label.toLowerCase()} — the column's height is how much of the book is there`}
        >
          <Board
            axis={boardAxis}
            cards={boardCards}
            axes={boardAxes}
            hrefFor={(c) => `/bookings/${c.id}`}
            cutFor={(itemKey) => into({ [boardAxis.key]: itemKey })}
          />
        </Region>
      )}

      <div className="q-regions">
        {/* 1 ─ what is happening today, and what is about to happen that is not ready */}
        <Region title="What is happening today" answers="what is happening today; what is about to happen that is not ready">
          {today.length === 0 && week.length === 0 && later.length === 0 ? (
            <p className="q-region-empty">Nothing is dated in the days ahead.</p>
          ) : (
            <>
              {today.map((n: NextRow) => (
                <Job key={n.booking.id} id={n.booking.id} name={n.booking.title} say={saySession(n.booking, n.crew, sheet.today)} badge={<Stage r={n.booking} />} tint />
              ))}
              {(week.length > 0 ? week : later).map((n: NextRow) => (
                <Job key={n.booking.id} id={n.booking.id} name={n.booking.title} say={saySession(n.booking, n.crew, sheet.today)} badge={<Stage r={n.booking} />} />
              ))}
            </>
          )}
        </Region>

        {/* 2 ─ what each job still needs */}
        <Region title="What each job still needs" answers="what is waiting on me; what is waiting on a client">
          {attention.filter((a) => a.count > 0).length === 0 ? (
            <p className="q-region-empty">Nothing is missing on any live job.</p>
          ) : (
            <div className="q-totals-said">
              {attention.filter((a) => a.count > 0).map((a) => (
                <Total key={a.key} say={sayAbsence(a.key, a.count)} href={into(a.narrow as Record<string, string>)} />
              ))}
            </div>
          )}
          {shownGaps.map((r) => (
            <Job
              key={r.id}
              id={r.id}
              name={r.title}
              say={[...sayNeeds(r, sheet.today), ...(oldest && r.id === oldest.id ? sayWait(r, sheet.today, true) : [])]}
              tail={`waiting ${sayAge(r.createdAt, sheet.today)}`}
              badge={<Stage r={r} />}
            />
          ))}
          {withGap.length > shownGaps.length && (
            <Link href="/bookings?all=1" className="q-region-more">{withGap.length - shownGaps.length} more jobs are missing something →</Link>
          )}
        </Region>

        {/* 3 ─ where the work is */}
        <Region title="Where the work is" answers="where is the work; what is the studio short of; what is finished and not closed">
          {roleTotals.length > 0 && (
            <Counts
              rows={roleTotals.map((role) => ({
                key: role.id,
                label: role.name,
                count: role.count,
                said: `${plural(role.count, 'open step')} ${verb(role.count, 'need')} ${article(role.name)}, and nobody is on ${them(role.count)}.`,
                href: into({ needs: role.id }),
                warm: true,
              }))}
            />
          )}
          {works.map((w) => (
            <Job
              key={w.booking.id}
              id={w.booking.id}
              name={w.booking.title}
              say={sayWork(w.booking, sheet.today)}
              badge={<Stage r={w.booking} />}
              draw={w.booking.work ? <Progress done={w.booking.work.done} total={w.booking.work.total} said={sayProgress(w.booking) ?? ''} /> : null}
            />
          ))}
          {toClose.map((r) => (
            <Job key={r.id} id={r.id} name={r.title} say={[{ t: 'Every step is done', tone: 'strong' }, { t: 'and the job is still open — only the stage says otherwise.' }]} badge={<Stage r={r} />} />
          ))}
          {works.length === 0 && toClose.length === 0 && <p className="q-region-empty">No job has open work behind its session.</p>}
          {toClose.length === 0 && works.length > 0 && <p className="q-region-note">No job has finished its steps and is waiting to be closed.</p>}
        </Region>

        {/* 4 ─ when everything is */}
        <Region title="When everything is" answers="the thirty days behind and ahead — the sessions, and the occasions they are for">
          <Days cells={dated.columns} weeks={dated.weeks} />
          {dated.days.length === 0 ? (
            <p className="q-region-empty">Nothing is dated within thirty days either side of today.</p>
          ) : (
            dated.days.map((d) => (
              <div key={d.day} className={d.today ? 'q-day q-day-now' : 'q-day'}>
                <span className="q-day-when">{d.today ? `Today, ${sayDay(d.day, sheet.today).replace('today, ', '')}` : sayDay(d.day, sheet.today)}</span>
                <span className="q-day-lines">
                  {d.lines.map((l, i) => (
                    <Link key={i} href={`/bookings/${l.bookingId}`} className="q-day-line"><Said say={l.say} /></Link>
                  ))}
                </span>
              </div>
            ))
          )}
          <p className="q-region-note">
            {plural(dated.ahead, 'session')} {dated.ahead === 1 ? 'falls' : 'fall'} in the next thirty days.
            {dated.undated > 0 && <> <Link href={into({ missing: 'date' })} className="q-said-warm q-plain-link">{plural(dated.undated, 'live job')} have no date at all</Link>, so they appear on no day above.</>}
          </p>
        </Region>

        {/* 5 ─ what the book has sold, and what nobody has answered */}
        <Region title="What the book has sold, and what nobody has answered" answers="what has the book sold; what has nobody answered">
          {sold.packages.length === 0 ? (
            <p className="q-region-empty">No live job carries a package yet.</p>
          ) : (
            <Counts
              rows={sold.packages.slice(0, 8).map((p) => ({
                key: p.name,
                label: p.name,
                count: p.jobs,
                said: `${p.name} is on ${plural(p.jobs, 'live job')}.`,
              }))}
            />
          )}
          {sold.questions.length > 0 && (
            <div className="q-lines q-lines-under">
              {sold.questions.map((question) => (
                <p key={question.label} className="q-line">
                  <span className="q-said-strong">{question.label}</span> is answered on {plural(question.answered, 'job')}
                  {question.said ? <> and comes to <span className="q-said-strong">{question.said}</span>.</> : '.'}
                  {question.next && <> The next of them is {question.next.name}&apos;s, {sayDay(question.next.day, sheet.today)}.</>}
                </p>
              ))}
            </div>
          )}
        </Region>

        {/* 6 ─ what the book is for */}
        {forDimensions.length > 0 && (
          <Region title="What the book is for" answers="what is the book for">
            {forDimensions.map((d) => (
              <div key={d.id} className="q-dim">
                <span className="q-dim-name">{d.name}</span>
                {d.values.length > 1 && (
                  <Share
                    of={d.values.reduce((n, v) => n + v.jobs, 0) + d.open}
                    slices={[
                      ...d.values.map((v) => ({ key: v.id, label: v.name, count: v.jobs, href: into({ [`dim:${d.id}`]: v.id }) })),
                      ...(d.open > 0 ? [{ key: 'open', label: 'not said', count: d.open, tone: 'warm' as const, href: into({ missing: 'classification' }) }] : []),
                    ]}
                  />
                )}
                <p className="q-dim-said">
                  {d.values.map((v, i) => (
                    <span key={v.id}>
                      {i > 0 ? ', ' : ''}
                      <Link href={into({ [`dim:${d.id}`]: v.id })} className="q-plain-link"><span className="q-said-strong">{v.name}</span> on {plural(v.jobs, 'job')}</Link>
                    </span>
                  ))}
                  {d.values.length > 0 && '. '}
                  {d.open > 0 && <Link href={into({ missing: 'classification' })} className="q-said-warm q-plain-link">{plural(d.open, 'job')} {d.open === 1 ? 'has' : 'have'} not said, though their packages ask.</Link>}
                </p>
              </div>
            ))}
          </Region>
        )}

        {/* 7 ─ where the studio says everything is */}
        <Region title="Where the studio says everything is" answers="where does the studio say everything is; whose move is the decision">
          <Share
            of={pipeline.reduce((n, st) => n + st.count, 0)}
            slices={pipeline.filter((st) => st.count > 0).map((st) => ({
              key: st.key, label: st.label, count: st.count,
              color: st.look?.color ?? null, href: into({ stage: st.key }),
            }))}
          />
          <div className="q-lines">
            {pipeline.filter((st) => st.count > 0).map((st) => (
              <p key={st.key} className="q-line">
                <Link href={into({ stage: st.key })} className="q-plain-link">
                  <span className="q-said-strong">{plural(st.count, 'job')}</span> {st.count === 1 ? 'is' : 'are'} at {st.label}
                </Link>
                {st.fact && <>. {st.fact.booking.clientName ?? st.fact.booking.title} has been there longest{st.kind === 'booked' ? '' : ` — ${st.fact.text.replace('longest in stage, ', '')}`}.</>}
              </p>
            ))}
          </div>
          <Share
            of={decision.awaitingStudio + decision.awaitingClient + decision.agreed}
            slices={[
              { key: 'you', label: 'waiting on you', count: decision.awaitingStudio, tone: 'warm' as const, href: into({ missing: 'decision-studio' }) },
              { key: 'client', label: 'waiting on the client', count: decision.awaitingClient, href: into({ missing: 'decision-client' }) },
              { key: 'agreed', label: 'agreed', count: decision.agreed, tone: 'green' as const },
            ].filter((x) => x.count > 0)}
          />
          <div className="q-lines q-lines-under">
            {decision.awaitingStudio > 0 && (
              <p className="q-line">
                <Link href={into({ missing: 'decision-studio' })} className="q-plain-link">
                  <span className="q-said-strong">{plural(decision.awaitingStudio, 'job')}</span> <span className="q-said-warm">{decision.awaitingStudio === 1 ? 'is' : 'are'} waiting on you</span> to put a proposal out
                </Link>.
              </p>
            )}
            {decision.awaitingClient > 0 && (
              <p className="q-line">
                <Link href={into({ missing: 'decision-client' })} className="q-plain-link">
                  <span className="q-said-strong">{plural(decision.awaitingClient, 'job')}</span> {decision.awaitingClient === 1 ? 'is' : 'are'} waiting on a client to agree a proposal
                </Link>.
              </p>
            )}
            {decision.agreed > 0 && <p className="q-line"><span className="q-said-strong">{plural(decision.agreed, 'job')}</span> {decision.agreed === 1 ? 'has' : 'have'} an agreement in place.</p>}
            {decision.bookedWithoutAgreement > 0 && (
              <p className="q-line">
                <span className="q-said-strong">{plural(decision.bookedWithoutAgreement, 'job')}</span> {decision.bookedWithoutAgreement === 1 ? 'was' : 'were'} moved to a booked stage{' '}
                <span className="q-said-warm">without a contract ever going active</span>, so the stage and the agreement disagree.
              </p>
            )}
          </div>
        </Region>

        {/* 8 ─ how the book moved, and what changed */}
        <Region title="How the book moved, and what changed" answers="is the book growing; what changed" right={periodControl}>
          <div className="q-measures">
            {sheet.figures.map((f) => {
              const said = f.unit === 'percent' ? `${f.value}%` : String(f.value);
              const line = sheet.series.lines.find((l) => l.key === f.key)?.points ?? null;
              return (
                <div key={f.key} className="q-measure">
                  <p className="q-measure-said">
                    <span className="q-measure-value">{said}</span>{' '}
                    {f.key === 'new' ? `jobs entered the book in the last ${plural(sheet.period.days, 'day')}`
                      : f.key === 'agreed' ? 'were agreed'
                      : f.key === 'conversion' ? 'of what came in was agreed'
                      : 'sessions were held'}
                    {', against '}
                    {f.unit === 'percent' ? `${f.before}%` : f.before === 0 ? 'none' : f.before}
                    {' in the window before it.'}
                    {f.note && f.key === 'conversion' && <> {f.note}.</>}
                  </p>
                  {line && <Trend points={line} months={sheet.series.months} said={`${f.label} by month, over the last year`} />}
                </div>
              );
            })}
          </div>
          <div className="q-lines q-lines-under">
            {recent.length === 0 ? (
              <p className="q-line">Nothing has happened on a booking yet.</p>
            ) : (
              recent.map((e) => (
                <p key={e.id} className="q-line">
                  {e.who} {e.booking ? e.phrase.replace(/\ba booking\b/, '') : e.phrase}
                  {e.booking && <> <Link href={`/bookings/${e.booking.id}`} className="q-plain-link q-said-strong">{e.booking.title}</Link></>}
                  , {ago(e.at, now)}.
                </p>
              ))
            )}
          </div>
        </Region>
      </div>
    </div>
  );
}
