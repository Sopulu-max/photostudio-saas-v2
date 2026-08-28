import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listTransactions, getMoneyTotals, listInvoices, KINDS, kindOf } from '@/modules/finances/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { CreateTransactionForm } from './client';

export const dynamic = 'force-dynamic';

export default async function FinancesPage() {
  await getAuthOrgId();

  const [transactions, totals, invoices, currencyCode] = await Promise.all([
    listTransactions(),
    getMoneyTotals(),
    listInvoices(),
    getStudioCurrency(),
  ]);

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Finances</h1>
          <p className="q-page-subtitle">What came in, what went out, and what&rsquo;s still owed.</p>
        </div>
        <div className="q-row">
          <Link href="/finances/settings" className="q-btn q-btn-secondary">Settings</Link>
          <CreateTransactionForm currencyCode={currencyCode} />
        </div>
      </header>

      {/*
        One set of figures per currency. Adding them would produce a number
        that's true in neither, which is what the old single total did.
      */}
      {totals.length === 0 ? (
        <div className="q-grid-3" style={{ marginBottom: '32px' }}>
          <div className="q-panel">
            <div className="q-stat-label">Earned</div>
            <div className="q-stat-value-lg">{formatMoney(0, currencyCode)}</div>
          </div>
        </div>
      ) : (
        totals.map((t) => (
          <div key={t.currency} className="q-grid-3" style={{ marginBottom: '32px' }}>
            <div className="q-panel">
              <div className="q-stat-label">
                Earned{totals.length > 1 ? ` · ${t.currency}` : ''}
              </div>
              <div className="q-stat-value-lg">{formatMoney(t.earned, t.currency)}</div>
              <div className="q-meta-sm">Settled charges, less refunds given back</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Owed{totals.length > 1 ? ` · ${t.currency}` : ''}</div>
              <div className="q-stat-value-lg q-warm">{formatMoney(t.owed, t.currency)}</div>
              <div className="q-meta-sm">Charges raised and not yet paid</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Spent{totals.length > 1 ? ` · ${t.currency}` : ''}</div>
              <div className="q-stat-value-lg">{formatMoney(t.spent, t.currency)}</div>
              <div className="q-meta-sm">What running the studio cost</div>
            </div>
          </div>
        ))
      )}

      {/* Invoices first: they're the documents a client sees, and the ledger
          below is the money that moved against them. */}
      <div className="q-card q-section" style={{ marginBottom: '24px' }}>
        <div className="q-row q-row-between" style={{ marginBottom: '14px' }}>
          <h2 className="q-section-title" style={{ margin: 0 }}>Invoices</h2>
          <span className="q-meta-sm">Raised from a booking — open one to bill it</span>
        </div>
        {invoices.length === 0 ? (
          <p className="q-empty">
            None yet. Open a booking and generate one from what was actually booked.
          </p>
        ) : (
          <div className="q-stack q-stack-sm">
            {invoices.slice(0, 8).map((inv: any) => (
              <Link key={inv.id} href={`/finances/invoices/${inv.id}`} className="q-tile q-row q-row-between q-plain-link">
                <div>
                  <strong className="q-strong">{inv.number || 'Draft'}</strong>
                  <div className="q-meta-sm">
                    {inv.contact?.display_name || 'No client'}
                    {inv.booking?.title ? ` · ${inv.booking.title}` : ''}
                  </div>
                </div>
                <div className="q-row">
                  <span className="q-num q-strong">{formatMoney(inv.total, inv.currency || currencyCode)}</span>
                  <span className={`q-badge ${
                    inv.status === 'void' ? 'q-badge-danger'
                    : inv.settled ? 'q-badge-success'
                    : inv.status === 'draft' ? 'q-badge-neutral' : 'q-badge-warning'
                  }`}>
                    {inv.status === 'void' ? 'withdrawn'
                      : inv.settled ? 'paid'
                      : inv.partly ? `${formatMoney(inv.outstanding, inv.currency || currencyCode)} left`
                      : inv.status === 'draft' ? 'draft' : 'unpaid'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <h2 className="q-section-title">Every movement</h2>
      {transactions.length === 0 ? (
        <div className="q-card" style={{ textAlign: 'center', padding: 'clamp(44px, 7vw, 76px) 24px', color: 'var(--q-color-ink-500)' }}>
          No money recorded yet. Invoices raised from a booking will show up here.
        </div>
      ) : (
        <div className="q-card q-table-container">
          <table className="q-table">
            <thead>
              <tr>
                <th className="q-table-th">Date</th>
                <th className="q-table-th">What</th>
                <th className="q-table-th">Who / what for</th>
                <th className="q-table-th">Kind</th>
                <th className="q-table-th">Amount</th>
                <th className="q-table-th">Status</th>
                <th className="q-table-th"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx: any) => {
                const kind = kindOf(tx);
                const spec = KINDS[kind];
                return (
                <tr key={tx.id} className="q-table-tr">
                  <td className="q-table-td q-meta">{new Date(tx.created_at).toLocaleDateString()}</td>
                  <td className="q-table-td q-cap">{String(tx.type).replace(/_/g, ' ')}</td>
                  <td className="q-table-td q-strong">
                    {tx.contact?.display_name || tx.booking?.title || <span className="q-meta">The studio</span>}
                  </td>
                  <td className="q-table-td">
                    <span className={`q-badge ${kind === 'charge' ? 'q-badge-success' : kind === 'refund' ? 'q-badge-warning' : 'q-badge-neutral'}`}>
                      {spec.label}
                    </span>
                  </td>
                  {/* Signed, so a cost never reads like income at a glance. */}
                  <td className={`q-table-td q-strong q-num${tx.status === 'voided' ? ' q-meta' : ''}`}>
                    {spec.direction === 'outbound' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
                  </td>
                  <td className="q-table-td">
                    <span className={`q-badge ${
                      tx.status === 'settled' ? 'q-badge-success' :
                      tx.status === 'pending' ? 'q-badge-warning' :
                      tx.status === 'voided' ? 'q-badge-danger' : 'q-badge-neutral'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="q-table-td" style={{ textAlign: 'right' }}>
                    <Link href={`/finances/${tx.id}`} className="q-btn q-btn-secondary q-btn-sm">
                      Open
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
