import { supabaseAdmin } from '@/lib/supabase/admin';

export default async function FinancesPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  const { data: transactions } = org 
    ? await supabaseAdmin
        .from('financial_transactions')
        .select(`
          *,
          person:persons(display_name)
        `)
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Financial Ledger</h1>
        <p className="q-page-subtitle">Track all invoices, payments, and financial movements.</p>
      </header>

      <div className="q-card q-table-container">
        <table className="q-table">
          <thead>
            <tr>
              <th className="q-table-th">Date</th>
              <th className="q-table-th">Type</th>
              <th className="q-table-th">Client</th>
              <th className="q-table-th">Amount</th>
              <th className="q-table-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {!transactions || transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="q-table-td" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
                  No transactions recorded.
                </td>
              </tr>
            ) : (
              transactions?.map((tx: any) => (
                <tr key={tx.id} className="q-table-tr">
                  <td className="q-table-td">{new Date(tx.created_at).toLocaleDateString()}</td>
                  <td className="q-table-td" style={{ textTransform: 'capitalize' }}>{tx.type}</td>
                  <td className="q-table-td" style={{ fontWeight: 500 }}>{tx.person?.display_name || 'System'}</td>
                  <td className="q-table-td" style={{ fontWeight: 600 }}>${(tx.amount / 100).toFixed(2)} {tx.currency.toUpperCase()}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${tx.status === 'completed' ? 'q-badge-success' : 'q-badge-neutral'}`}>
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
