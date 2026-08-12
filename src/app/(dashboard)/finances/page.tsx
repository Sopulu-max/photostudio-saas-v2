import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listTransactions, getMoneyTotals, KINDS, kindOf } from '@/modules/finances/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { CreateTransactionForm } from './client';

export const dynamic = 'force-dynamic';

export default async function FinancesPage() {
  await getAuthOrgId();

  const [transactions, totals, currencyCode] = await Promise.all([
    listTransactions(),
    getMoneyTotals(),
    getStudioCurrency(),
  ]);

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Finances</h1>
          <p className="q-page-subtitle">What came in, what went out, and what&rsquo;s still owed.</p>
        </div>
        <CreateTransactionForm currencyCode={currencyCode} />
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
