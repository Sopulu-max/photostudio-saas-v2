import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export default async function FinancesPage() {
  const { orgId } = await getAuthOrgId();

  const { data: transactions } = await supabaseAdmin
    .from('financial_transactions')
    .select(`*, person:persons(display_name)`)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  const totalSettled = transactions
    ?.filter((t: any) => t.status === 'settled')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0;

  const totalPending = transactions
    ?.filter((t: any) => t.status === 'pending')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0;

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Financial Ledger</h1>
        <p className="q-page-subtitle">The unified record of every money movement for this organization.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Settled Revenue</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>${totalSettled.toFixed(2)}</div>
        </div>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Pending / Outstanding</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600, color: '#d97706' }}>${totalPending.toFixed(2)}</div>
        </div>
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Total Transactions</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{transactions?.length || 0}</div>
        </div>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {!transactions || transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="q-table-td" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
                  No transactions recorded.
                </td>
              </tr>
            ) : (
              transactions?.map((tx: any) => (
                <tr key={tx.id} className="q-table-tr">
                  <td className="q-table-td">{new Date(tx.created_at).toLocaleDateString()}</td>
                  <td className="q-table-td" style={{ textTransform: 'capitalize' }}>{tx.type.replace(/_/g, ' ')}</td>
                  <td className="q-table-td" style={{ fontWeight: 500 }}>{tx.person?.display_name || 'System'}</td>
                  <td className="q-table-td">
                    <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '4px', backgroundColor: tx.direction === 'inbound' ? '#D1FAE5' : '#FEE2E2', color: tx.direction === 'inbound' ? '#065F46' : '#991B1B', fontWeight: 500 }}>
                      {tx.direction}
                    </span>
                  </td>
                  <td className="q-table-td" style={{ fontWeight: 600 }}>{tx.currency?.toUpperCase()} {Number(tx.amount).toFixed(2)}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${
                      tx.status === 'settled' ? 'q-badge-success' :
                      tx.status === 'pending' ? 'q-badge-warning' :
                      tx.status === 'voided' ? 'q-badge-error' : 'q-badge-neutral'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
