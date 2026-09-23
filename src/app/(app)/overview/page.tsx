import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudio } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { listRecentActivity } from '@/kernel/events';
import { listBookings, listBookingsInRange } from '@/modules/bookings/interface';
import { listTransactions, listInvoices, settlementOf } from '@/modules/finances/interface';
import { listContracts } from '@/modules/contracts/interface';
import { listServices } from '@/modules/services/interface';
import { listPackages } from '@/modules/packages/interface';

export const dynamic = 'force-dynamic';

function fmtDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The Command Center is a VIEW, not a module: it owns no data and queries no
 * tables. Every figure here is asked of whichever module owns it — the same
 * discipline the Calendar already follows — so this page can't drift from
 * what those modules mean by "open booking" or "pending".
 */
async function getOverviewData() {
  try {
    await getAuthOrgId();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    // Look ahead 7 days for the schedule
    const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

    const [org, recentEvents, allBookings, transactions, weekShoots, services, packages, contracts, taskDeadlines, invoices] = await Promise.all([
      getStudio(),
      listRecentActivity(10),
      listBookings(),
      listTransactions(),
      listBookingsInRange(todayStart, weekEnd),
      listServices(),
      listPackages(),
      listContracts(),
      Promise.resolve([]),
      // Last in the array because `invoices` is last in the destructuring
      // above: inserting a read in the middle silently shifts every name after
      // it, which is how weekShoots came to hold thirty invoices.
      listInvoices(),
    ]);
    if (!org) return null;

    // === ACTION INBOX ===
    // New enquiries: bookings in enquiry stage — these need vetting
    const enquiries = allBookings
      .filter((b) => b.stage?.kind === 'enquiry')
      .slice(0, 5);

    // Pending contracts: awaiting client signature
    const pendingContracts = (contracts as any[])
      .filter((c) => c.status === 'proposed' || c.status === 'modified')
      .slice(0, 5);

    /*
     * WHAT IS STILL OWED, which is not the same as a pending payment record.
     *
     * Both money figures were counted from financial_transactions with a
     * pending status - payments somebody had begun to record. Money simply not
     * yet received has no transaction row at all, so a studio owed fifty
     * thousand naira on a part-paid invoice read "Outstanding 0" on the most
     * prominent screen it has. A headline figure saying nothing is owed while
     * something is owed is worse than no figure.
     *
     * An invoice is owed what it has not been paid, and settlementOf is the
     * rule Finances already applies on the booking page - refunds un-pay,
     * unsettled payments do not count, a zero-total invoice is not "paid".
     * Called here rather than reckoned again.
     */
    const live = (invoices as any[]).filter((i) => i.status !== 'void' && i.status !== 'draft');
    const owing = live
      .map((i) => ({ invoice: i, owed: settlementOf(i.total, i.payments || []).outstanding }))
      .filter((x) => x.owed > 0);

    // Still shown beneath: the payments somebody has begun recording.
    const pendingPayments = (transactions as any[])
      .filter((t) => t.status === 'pending')
      .slice(0, 5);

    // === STATS ===
    const activeBookings = allBookings.filter((b) => b.stage?.kind === 'enquiry' || b.stage?.kind === 'booked');
    const totalPendingAmount = owing.reduce((sum, x) => sum + x.owed, 0);
    const pendingCurrency = owing[0]?.invoice.currency || pendingPayments[0]?.currency || 'NGN';

    // === SCHEDULE ===
    // Tasks due this week that are not yet completed
    const upcomingTasks = (taskDeadlines as any[])
      .filter((t) => t.status !== 'completed')
      .slice(0, 6);

    // Active bookings (booked stage) — shown in the "Open bookings" section
    const bookedBookings = allBookings
      .filter((b) => b.stage?.kind === 'booked')
      .slice(0, 6);

    return {
      org,
      recentEvents,
      enquiries,
      pendingContracts,
      pendingPayments,
      weekShoots,
      upcomingTasks,
      bookedBookings,
      stats: {
        activeBookings: activeBookings.length,
        // Invoices with money still on them, not payment records in progress.
        pendingInvoices: owing.length,
        pendingAmount: totalPendingAmount,
        pendingCurrency,
        thisWeekShoots: weekShoots.length,
      },
    };
  } catch (err: any) {
    return { fatalError: err.message || 'Unknown error' };
  }
}

export default async function OverviewPage() {
  const data = await getOverviewData();

  if (data && 'fatalError' in data) {
    return (
      <div className="q-note q-note-bad">
        <h1>FATAL ERROR</h1>
        <p>{data.fatalError}</p>
      </div>
    );
  }
  if (!data) return null;

  const { org, recentEvents, enquiries, pendingContracts, pendingPayments, weekShoots, upcomingTasks, bookedBookings, stats } = data;
  const hasInboxItems = enquiries.length > 0 || pendingContracts.length > 0 || pendingPayments.length > 0;

  return (
    <div>
      <header className="q-page-header">
        <div>
          {/* The heading says what the page is and the sections say what they
              hold, so a subtitle had nothing left to tell anyone: it greeted
              the reader by the hour and then announced the page it was already
              on (Law 7, and the app does not address the operator). */}
          <h1 className="q-page-title">Command Center</h1>
        </div>
        <Link href="/bookings/new" className="q-btn q-btn-primary">+ New booking</Link>
      </header>

      {/* Stat bar — quick pulse numbers */}
      <div className="q-grid-4">
        <div className="q-stat-card">
          <div className="q-stat-label">Active bookings</div>
          <div className="q-stat-value-lg">{stats.activeBookings}</div>
        </div>
        <div className="q-stat-card">
          <div className="q-stat-label">This week</div>
          <div className="q-stat-value-lg">{stats.thisWeekShoots} <span className="q-meta">shoots</span></div>
        </div>
        <div className="q-stat-card">
          <div className="q-stat-label">Pending invoices</div>
          <div className="q-stat-value-lg">{stats.pendingInvoices}</div>
        </div>
        <div className="q-stat-card">
          <div className="q-stat-label">Outstanding</div>
          <div className="q-stat-value-lg q-warm">{formatMoney(stats.pendingAmount, stats.pendingCurrency)}</div>
        </div>
      </div>

      <div className="q-cc-layout q-divider">

        {/* Main column */}
        <div className="q-stack q-stack-lg">

          {/* === ACTION INBOX === */}
          {hasInboxItems && (
            <div className="q-card">
              <h2 className="q-section-title">Needs attention</h2>
              <div className="q-stack q-stack-sm">

                {/* New enquiries */}
                {enquiries.map((b) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} className="q-inbox-item">
                    <div>
                      <strong className="q-strong">{b.title}</strong>
                      {b.clientName && <div className="q-meta">{b.clientName}</div>}
                    </div>
                    <span className={`q-badge ${stageBadgeClass(b.stage)}`}>New enquiry</span>
                  </Link>
                ))}

                {/* Pending contracts */}
                {pendingContracts.map((c: any) => (
                  <Link key={c.id} href={`/contracts/${c.id}`} className="q-inbox-item q-inbox-item-accent">
                    <div>
                      <strong className="q-strong">{c.booking?.title || 'Contract'}</strong>
                      <div className="q-meta">{c.person?.display_name || 'Client'} · awaiting signature</div>
                    </div>
                    <span className="q-badge q-badge-warning">{c.status}</span>
                  </Link>
                ))}

                {/* Pending invoices */}
                {pendingPayments.map((tx: any) => (
                  <Link
                    key={tx.id}
                    href={tx.booking?.id ? `/bookings/${tx.booking.id}` : '/finances'}
                    className="q-inbox-item"
                  >
                    <div>
                      <strong className="q-strong">{tx.booking?.title || tx.contact?.display_name || 'Client'}</strong>
                      {tx.contact?.display_name && tx.booking?.title && (
                        <div className="q-meta">{tx.contact.display_name}</div>
                      )}
                    </div>
                    <span className="q-strong q-num q-warm">{formatMoney(tx.amount, tx.currency)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* === THIS WEEK'S SCHEDULE === */}
          <div className="q-card">
            <div className="q-row q-row-between">
              <h2 className="q-section-title">This week</h2>
              <Link href="/calendar" className="q-meta q-accent">Calendar →</Link>
            </div>

            {weekShoots.length === 0 && upcomingTasks.length === 0 ? (
              <p className="q-empty">Nothing scheduled this week.</p>
            ) : (
              <div className="q-stack q-stack-sm">
                {/* Shoots */}
                {weekShoots.map((b) => (
                  <Link key={b.bookingId} href={`/bookings/${b.bookingId}`} className="q-sched-chip">
                    <div>
                      <strong className="q-strong">{b.title}</strong>
                      {b.client && <div className="q-meta">{b.client}</div>}
                    </div>
                    <span className="q-num q-meta">{fmtDay(b.at)} · {fmtTime(b.at)}</span>
                  </Link>
                ))}

                {/* Task deadlines */}
                {upcomingTasks.length > 0 && weekShoots.length > 0 && (
                  <div className="q-divider" />
                )}
                {upcomingTasks.map((t: any) => (
                  <Link key={t.taskId} href={`/bookings/${t.bookingId}`} className="q-sched-chip">
                    <div>
                      <strong className="q-strong">{t.title}</strong>
                      <div className="q-meta">{t.bookingTitle} · {t.lineTitle}</div>
                    </div>
                    <span className="q-num q-meta">{fmtDay(t.at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* === OPEN BOOKINGS === */}
          <div className="q-card">
            <div className="q-row q-row-between">
              <h2 className="q-section-title">Open bookings</h2>
              <Link href="/bookings" className="q-meta q-accent">See all →</Link>
            </div>
            {bookedBookings.length === 0 ? (
              <p className="q-empty">No active bookings right now.</p>
            ) : (
              <div className="q-stack q-stack-sm">
                {bookedBookings.map((b) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} className="q-sched-chip">
                    <div>
                      <strong className="q-strong">{b.title}</strong>
                      {b.clientName && <div className="q-meta">{b.clientName}</div>}
                    </div>
                    <span className={`q-badge ${stageBadgeClass(b.stage)}`}>{b.stage?.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Activity feed sidebar */}
        <div className="q-card q-cc-sidebar">
          <h2 className="q-section-title">Activity</h2>
          {recentEvents.length === 0 ? (
            <p className="q-empty">No activity yet.</p>
          ) : (
            <div className="q-stack q-stack-md">
              {recentEvents.map((evt) => (
                <div key={evt.id} className="q-meta-plain">
                  <div>{evt.description}</div>
                  <div className="q-meta">
                    {new Date(evt.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
