import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatMoney } from '@/kernel/currency';

export const dynamic = 'force-dynamic';

export default async function ClientPaymentPage(props: { params: Promise<{ orgSlug: string, txId: string }> }) {
  const params = await props.params;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', params.orgSlug)
    .single();

  if (!org) {
    return (
      <div className="q-public">
        <main className="q-public-main q-center-text"><h1>Studio Not Found</h1></main>
      </div>
    );
  }

  const { data: tx } = await supabaseAdmin
    .from('financial_transactions')
    .select('*, person:contacts(display_name)')
    .eq('id', params.txId)
    .eq('organization_id', org.id)
    .single();

  if (!tx) {
    return (
      <div className="q-public">
        <main className="q-public-main q-center-text"><h1>Invoice Not Found</h1></main>
      </div>
    );
  }

  const isSettled = tx.status === 'settled';

  return (
    <div className="q-public">
      <header className="q-public-header">
        <div className="q-eyebrow">{org.name}</div>
        <h1 className="q-page-title">Payment Request</h1>
      </header>

      <main className="q-public-main">
        <div className="q-card">
          <div className="q-panel">
            <div className="q-kv">
              <span className="q-kv-key">Client</span>
              <span className="q-kv-value">{tx.person?.display_name || 'Valued Client'}</span>
            </div>
            <div className="q-kv">
              <span className="q-kv-key">Invoice</span>
              <span className="q-kv-value q-cap">{String(tx.type).replace(/_/g, ' ')}</span>
            </div>
            <div className="q-kv">
              <span className="q-kv-key">Status</span>
              <span className={`q-badge ${isSettled ? 'q-badge-success' : 'q-badge-warning'}`}>{tx.status}</span>
            </div>

            <div className="q-kv q-divider">
              <span className="q-strong">Amount due</span>
              <span className="q-amount">{formatMoney(tx.amount, tx.currency)}</span>
            </div>
          </div>

          {isSettled ? (
            <div className="q-note q-note-good q-center-text q-strong" style={{ marginTop: '24px' }}>
              This invoice has been paid. Thank you.
            </div>
          ) : (
            <form
              style={{ marginTop: '24px' }}
              action={async () => {
                'use server';
                const { processPayment } = await import('@/modules/finances/interface');
                await processPayment(tx.id);
              }}
            >
              <button type="submit" className="q-btn q-btn-primary q-btn-block">
                Pay securely
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
