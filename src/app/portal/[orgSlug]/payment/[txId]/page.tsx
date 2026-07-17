import { supabaseAdmin } from '@/lib/supabase/admin';

export default async function ClientPaymentPage({ params }: { params: { orgSlug: string, txId: string } }) {
  // Fetch org by slug
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', params.orgSlug)
    .single();

  if (!org) {
    return <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'sans-serif' }}><h1>Studio Not Found</h1></div>;
  }

  // Fetch the financial transaction
  const { data: tx } = await supabaseAdmin
    .from('financial_transactions')
    .select('*, person:persons(display_name)')
    .eq('id', params.txId)
    .single();

  if (!tx) {
    return <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'sans-serif' }}><h1>Invoice Not Found</h1></div>;
  }

  return (
    <div style={{ maxWidth: '600px', margin: '64px auto', padding: '48px', fontFamily: 'sans-serif', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
      <header style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ fontSize: '0.875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{org.name}</div>
        <h1 style={{ fontSize: '2rem', margin: '8px 0 0 0' }}>Payment Request</h1>
      </header>

      <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ color: '#4b5563' }}>Client</span>
          <span style={{ fontWeight: 500 }}>{tx.person?.display_name || 'Valued Client'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ color: '#4b5563' }}>Invoice Type</span>
          <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{tx.type}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ color: '#4b5563' }}>Status</span>
          <span style={{ fontWeight: 500, textTransform: 'uppercase', color: tx.status === 'completed' ? '#059669' : '#d97706' }}>
            {tx.status}
          </span>
        </div>
        
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '24px', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '1.125rem', fontWeight: 600 }}>Amount Due</span>
          <span style={{ fontSize: '2rem', fontWeight: 600 }}>${(tx.amount / 100).toFixed(2)}</span>
        </div>
      </div>

      {tx.status !== 'completed' && (
        <form action={async () => { 'use server'; console.log('Process payment action'); }}>
          <button type="submit" style={{ padding: '16px 32px', width: '100%', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1.125rem', fontWeight: 600, cursor: 'pointer' }}>
            Pay Securely with Stripe
          </button>
        </form>
      )}

      {tx.status === 'completed' && (
        <div style={{ textAlign: 'center', padding: '16px', background: '#d1fae5', color: '#065f46', borderRadius: '8px', fontWeight: 500 }}>
          This invoice has been paid.
        </div>
      )}
    </div>
  );
}
