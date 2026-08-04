import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listTransactions } from '@/modules/finances/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { CreateTransactionForm } from './client';

export const dynamic = 'force-dynamic';

export default async function FinancesPage() {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const [transactions, currencyCode] = await Promise.all([
    listTransactions(),
    getStudioCurrency(),
  ]);

  const totalSettled = transactions
    .filter((t: any) => t.status === 'settled')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  const totalPending = transactions
    .filter((t: any) => t.status === 'pending')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Finances</h1>
          <p className="q-page-subtitle">Every invoice and payment across your studio.</p>
        </div>
        <CreateTransactionForm orgId={orgId} actorId={actorId ?? orgId} currencyCode={currencyCode} />
      </header>

      <div className="q-grid-3" style={{ marginBottom: '32px' }}>
        <div className="q-panel">
          <div className="q-stat-label">Settled</div>
          <div className="q-stat-value-lg">{formatMoney(totalSettled, currencyCode)}</div>
        </div>
        <div className="q-panel">
          <div className="q-stat-label">Pending</div>
          <div className="q-stat-value-lg q-warm">{formatMoney(totalPending, currencyCode)}</div>
        </div>
        <div className="q-panel">
          <div className="q-stat-label">Transactions</div>
          <div className="q-stat-value-lg q-num">{transactions.length}</div>
        </div>
      </div>

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
                <th className="q-table-th">Type</th>
                <th className="q-table-th">Client</th>
                <th className="q-table-th">Direction</th>
                <th className="q-table-th">Amount</th>
                <th className="q-table-th">Status</th>
                <th className="q-table-th"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx: any) => (
                <tr key={tx.id} className="q-table-tr">
                  <td className="q-table-td q-meta">{new Date(tx.created_at).toLocaleDateString()}</td>
                  <td className="q-table-td q-cap">{String(tx.type).replace(/_/g, ' ')}</td>
                  <td className="q-table-td q-strong">{tx.contact?.display_name || tx.booking?.title || 'System'}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${tx.direction === 'inbound' ? 'q-badge-success' : 'q-badge-danger'}`}>
                      {tx.direction}
                    </span>
                  </td>
                  <td className="q-table-td q-strong q-num">{formatMoney(tx.amount, tx.currency)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
