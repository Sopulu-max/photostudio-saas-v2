import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { formatMoney } from '@/kernel/currency';
import { readStudioOverview, readStudioOwed } from '@/modules/overview/interface';

export const dynamic = 'force-dynamic';

/**
 * THE COMMAND CENTER - the studio, not its bookings.
 *
 * Every section here used to be bookings: what needs attention, this week,
 * open bookings, recent activity. So it competed with the bookings page while
 * answering worse, and a studio's people, work, papers, galleries and money
 * appeared nowhere. Two of its four headline figures were also counted from
 * pending payment RECORDS rather than from what was owed, so it reported
 * nothing outstanding while seventy thousand was outstanding.
 *
 * Now the sections are the studio's own parts, named as the nav names them,
 * and each says what that part is BLOCKED on rather than how much of it
 * exists. A count of galleries informs nobody; galleries finished and never
 * sent is somebody's morning. A part with nothing blocked says so, because
 * "all sent" is a fact and an empty space is not.
 *
 * TODAY IS FIRST and is the only section that is not a part of the studio but
 * a moment in it: whether the studio is open, who is in, and what it holds
 * today. It comes first because it is the only thing that cannot be deferred.
 *
 * Every figure is a door into the module that owns it. Nothing is stored for
 * this page and nothing is re-derived here (modules/overview).
 */
export default async function CommandCenterPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [studio, owed] = await Promise.all([readStudioOverview(), readStudioOwed()]);
  const { today } = studio;

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Command Center</h1>
        </div>
        <Link href="/bookings/new" className="q-btn q-btn-primary">New booking</Link>
      </header>

      {/* ---- TODAY: the studio's own day, from its own record of its hours. */}
      <section className="q-card q-stack q-stack-md">
        <div className="q-row q-row-between">
          <h2 className="q-section-title">Today</h2>
          <Link href="/attendance" className="q-plain-link q-meta">Attendance</Link>
        </div>

        <p className="q-text-body">
          {today.closed
            ? <>The studio is shut today{today.openingLabel ? <> &mdash; {today.openingLabel}</> : null}.</>
            : today.opensAt
              ? <>Open {today.opensAt}{today.closesAt ? <> to {today.closesAt}</> : null}{today.openingLabel ? <> &mdash; {today.openingLabel}</> : null}.</>
              : <>No opening hours recorded for today.</>}
          {' '}
          {today.present > 0
            ? <><strong>{today.present}</strong> in{today.expected > 0 ? <>, {today.expected} still expected</> : null}</>
            : today.expected > 0
              ? <><strong>{today.expected}</strong> expected, nobody in yet</>
              : <>Nobody is expected today</>}
          {today.late > 0 ? <>, {today.late} late</> : null}.
        </p>

        {today.sessions.length > 0 ? (
          <div className="q-stack q-stack-sm">
            {today.sessions.map((s) => (
              <Link key={s.id} href={s.href} className="q-tile q-row q-row-between q-plain-link">
                <strong className="q-strong">{s.said}</strong>
                <span className="q-meta">Open</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="q-meta">No session is held today.</p>
        )}
      </section>

      {/* ---- WHAT IS OWED: the one figure that is money, and Finances owns it. */}
      <section className="q-card q-row q-row-between">
        <div>
          <div className="q-stat-label">Owed to the studio</div>
          <div className="q-stat-value-lg">
            {owed.amount > 0 ? formatMoney(owed.amount, owed.currency) : formatMoney(0, owed.currency)}
          </div>
          <p className="q-meta">
            {owed.invoices > 0
              ? `across ${owed.invoices} issued ${owed.invoices === 1 ? 'invoice' : 'invoices'}`
              : 'every issued invoice is settled'}
          </p>
        </div>
        <Link href="/finances" className="q-btn q-btn-secondary q-btn-sm">Finances</Link>
      </section>

      {/* ---- THE PARTS: one reading each, and each one a door. */}
      <div className="q-grid-2">
        {studio.parts.map((part) => (
          <section key={part.key} className="q-card q-stack q-stack-sm">
            <div className="q-row q-row-between">
              <h2 className="q-section-title">{part.name}</h2>
              <Link href={part.href} className="q-plain-link q-meta">Open</Link>
            </div>

            <p className={part.settled ? 'q-text-body' : 'q-text-body q-warm'}>{part.said}</p>

            {part.lines.length > 0 && (
              <div className="q-stack q-stack-sm">
                {part.lines.map((line) => (
                  <Link key={line.id} href={line.href} className="q-tile q-row q-row-between q-plain-link">
                    <strong className="q-strong">{line.said}</strong>
                    {line.note && <span className="q-meta">{line.note}</span>}
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* ---- WHAT HAS HAPPENED: the event log, which is the only record of it. */}
      <section className="q-card q-stack q-stack-sm">
        <h2 className="q-section-title">Activity</h2>
        {studio.activity.length === 0 ? (
          <p className="q-meta">Nothing has happened yet.</p>
        ) : (
          studio.activity.map((e) => (
            <div key={e.id} className="q-row q-row-between">
              <span className="q-text-body">{e.said}</span>
              <span className="q-meta-sm">{new Date(e.at).toLocaleString('en-GB')}</span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
