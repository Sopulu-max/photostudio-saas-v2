import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatMoney } from '@/kernel/currency';
import { PrintButton } from './PrintButton';

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
  const displayTitle = isSettled ? 'Receipt' : 'Invoice';

  return (
    <div className="q-public">
      <header className="q-public-header hide-on-print">
        <div className="q-eyebrow">{org.name}</div>
        <h1 className="q-page-title">{displayTitle}</h1>
      </header>

      <main className="q-public-main">
        <div className="q-card" style={{ padding: '40px' }}>
          {/* Printable Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px', borderBottom: '2px solid var(--q-color-ink-900)', paddingBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)' }}>
                {displayTitle}
              </h1>
              <div className="q-meta">{org.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="q-meta-sm">Date</div>
              <div className="q-strong">{new Date(tx.created_at).toLocaleDateString()}</div>
              <div className="q-meta-sm" style={{ marginTop: '8px' }}>Invoice ID</div>
              <div className="q-meta">{tx.id.split('-')[0].toUpperCase()}</div>
            </div>
          </div>

          <div className="q-panel" style={{ border: 'none', padding: 0, backgroundColor: 'transparent' }}>
            <div className="q-kv">
              <span className="q-kv-key">Billed To</span>
              <span className="q-kv-value q-strong" style={{ fontSize: '1.1rem' }}>{tx.person?.display_name || 'Valued Client'}</span>
            </div>
            <div className="q-kv">
              <span className="q-kv-key">Description</span>
              <span className="q-kv-value q-cap">{String(tx.type).replace(/_/g, ' ')}</span>
            </div>
            <div className="q-kv">
              <span className="q-kv-key">Status</span>
              <span className={`q-badge ${isSettled ? 'q-badge-success' : 'q-badge-warning'}`}>{tx.status}</span>
            </div>

            <div className="q-kv q-divider" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px dashed var(--q-color-ink-200)' }}>
              <span className="q-strong" style={{ fontSize: '1.25rem' }}>Amount due</span>
              <span className="q-amount" style={{ fontSize: '1.5rem', fontWeight: 800 }}>{formatMoney(tx.amount, tx.currency)}</span>
            </div>
          </div>

          {isSettled ? (
            <div style={{ marginTop: '40px' }}>
              <div className="q-note q-note-good q-center-text q-strong hide-on-print" style={{ marginBottom: '16px' }}>
                This invoice has been paid. Thank you.
              </div>
              <div style={{ padding: '24px', border: '2px solid var(--q-color-accent)', borderRadius: '12px', textAlign: 'center', backgroundColor: 'color-mix(in srgb, var(--q-color-accent) 5%, transparent)' }}>
                <h2 style={{ color: 'var(--q-color-accent)', margin: 0, fontSize: '1.5rem', letterSpacing: '0.1em' }}>PAID</h2>
                <div className="q-meta-sm" style={{ marginTop: '8px', color: 'var(--q-color-accent-hi)' }}>Settled on {new Date(tx.settled_at).toLocaleDateString()}</div>
              </div>
              <PrintButton />
            </div>
          ) : (
            <form
              className="hide-on-print"
              style={{ marginTop: '40px' }}
              action={async () => {
                'use server';
                const { processPayment } = await import('@/modules/finances/interface');
                await processPayment(tx.id);
              }}
            >
              <button type="submit" className="q-btn q-btn-primary q-btn-block" style={{ padding: '16px', fontSize: '1.1rem' }}>
                Pay Securely
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
