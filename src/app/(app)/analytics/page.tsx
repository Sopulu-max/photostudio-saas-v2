import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listBookings } from '@/modules/bookings/interface';
import { listTransactions } from '@/modules/finances/interface';
import { listTasks } from '@/modules/production/interface';
import { listRecentActivity } from '@/kernel/events';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  await getAuthOrgId();

  const [allBookings, transactions, tasks, recentEvents, currencyCode] = await Promise.all([
    listBookings(),
    listTransactions(),
    listTasks(),
    listRecentActivity(20),
    getStudioCurrency(),
  ]);

  const totalSettled = transactions
    .filter((t: any) => t.status === 'settled' && t.direction === 'inbound')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  const totalPending = transactions
    .filter((t: any) => t.status === 'pending' && t.direction === 'inbound')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  const activeTasks   = tasks.filter((t) => t.status === 'in_progress').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;

  const activeBookings = allBookings.filter((b: any) => b.stage?.kind === 'booked').length;
  const conversionRate = allBookings.length
    ? Math.round((activeBookings / allBookings.length) * 100)
    : 0;

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Analytics</h1>
          <p className="q-page-subtitle">Business intelligence and operational insights for your studio.</p>
        </div>
      </header>

      <div className="q-grid-3" style={{ marginBottom: '32px' }}>
        <div className="q-panel">
          <div className="q-stat-label">Settled Revenue</div>
          <div className="q-stat-value-lg">{formatMoney(totalSettled, currencyCode)}</div>
        </div>
        <div className="q-panel">
          <div className="q-stat-label">Outstanding</div>
          <div className="q-stat-value-lg q-warm">{formatMoney(totalPending, currencyCode)}</div>
        </div>
        <div className="q-panel">
          <div className="q-stat-label">Total Bookings</div>
          <div className="q-stat-value-lg q-num">{allBookings.length}</div>
        </div>
        <div className="q-panel">
          <div className="q-stat-label">Active Bookings</div>
          <div className="q-stat-value-lg q-num">{activeBookings}</div>
        </div>
        <div className="q-panel">
          <div className="q-stat-label">Tasks In Progress</div>
          <div className="q-stat-value-lg q-num">{activeTasks}</div>
        </div>
        <div className="q-panel">
          <div className="q-stat-label">Tasks Completed</div>
          <div className="q-stat-value-lg q-num">{completedTasks}</div>
        </div>
      </div>

      <div className="q-grid-2" style={{ marginBottom: '32px' }}>
        <div className="q-panel">
          <div className="q-stat-label">Enquiry → Active Conversion</div>
          <div className="q-stat-value-lg q-num">{conversionRate}%</div>
          <div className="q-meta">{activeBookings} of {allBookings.length} bookings are active</div>
        </div>
        <div className="q-panel">
          <div className="q-stat-label">Transactions</div>
          <div className="q-stat-value-lg q-num">{transactions.length}</div>
          <div className="q-meta">{transactions.filter((t: any) => t.status === 'pending').length} pending</div>
        </div>
      </div>

      <div className="q-card">
        <h3 className="q-section-title" style={{ marginBottom: '16px' }}>Recent Activity</h3>
        {recentEvents.length === 0 ? (
          <p className="q-empty">No activity recorded yet.</p>
        ) : (
          <div className="q-stack q-stack-sm">
            {recentEvents.map((ev) => (
              <div key={ev.id} className="q-tile q-row q-row-between">
                <span className="q-meta-plain">{ev.description}</span>
                <span className="q-meta">
                  {new Date(ev.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
