import { supabaseAdmin } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { SettleTransactionClient } from './client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TransactionDetailPage({ params }: { params: { id: string } }) {
  const { orgId } = await getAuthOrgId();

  const { data: transaction } = await supabaseAdmin
    .from('financial_transactions')
    .select(`
      *,
      person:persons(display_name, email),
      agreement:agreements(id, version)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!transaction) return notFound();

  // Get a fallback actor for logging
  const { data: actors } = await supabaseAdmin
    .from('persons')
    .select('id')
    .eq('organization_id', orgId)
    .limit(1);
  const fallbackActorId = actors?.[0]?.id || orgId;

  return (
    <div>
      <Link href="/finances" style={{ display: 'inline-block', marginBottom: '16px', color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>
        ← Back to Ledger
      </Link>
      
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="q-page-title">Transaction Details</h1>
          <p className="q-page-subtitle">{transaction.id}</p>
        </div>
        {transaction.status !== 'settled' && transaction.status !== 'voided' && (
          <SettleTransactionClient transactionId={transaction.id} orgId={orgId} actorId={fallbackActorId} />
        )}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Overview</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Amount</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{transaction.currency?.toUpperCase()} {Number(transaction.amount).toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Status</div>
              <div style={{ marginTop: '4px' }}>
                <span className={`q-badge ${
                  transaction.status === 'settled' ? 'q-badge-success' :
                  transaction.status === 'pending' ? 'q-badge-warning' :
                  transaction.status === 'voided' ? 'q-badge-error' : 'q-badge-neutral'
                }`}>
                  {transaction.status}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid var(--q-color-ink-200)', paddingTop: '16px' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Type</div>
              <div style={{ textTransform: 'capitalize' }}>{transaction.type.replace(/_/g, ' ')}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Direction</div>
              <div>
                <span style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '4px', backgroundColor: transaction.direction === 'inbound' ? '#D1FAE5' : '#FEE2E2', color: transaction.direction === 'inbound' ? '#065F46' : '#991B1B', fontWeight: 500 }}>
                  {transaction.direction}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="q-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '16px' }}>Related Entities</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Client / Person</div>
              <div>{transaction.person ? transaction.person.display_name : 'System Generated'}</div>
            </div>
            
            {transaction.agreement && (
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Agreement</div>
                <Link href={`/agreements/${transaction.agreement.id}`} style={{ color: 'var(--q-color-brand-600)', textDecoration: 'none' }}>
                  View Agreement (v{transaction.agreement.version})
                </Link>
              </div>
            )}
          </div>
          
          <div className="q-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '16px' }}>Timeline</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Created At</div>
              <div>{new Date(transaction.created_at).toLocaleString()}</div>
            </div>
            
            {transaction.settled_at && (
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Settled At</div>
                <div>{new Date(transaction.settled_at).toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
