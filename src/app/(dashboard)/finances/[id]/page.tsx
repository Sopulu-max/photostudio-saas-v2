import { supabaseAdmin } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { SettleTransactionClient } from './client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TransactionDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { orgId } = await getAuthOrgId();

  const { data: transaction } = await supabaseAdmin
    .from('financial_transactions')
    .select(`
      *,
      person:contacts(display_name, email),
      contract:contracts(id, version)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!transaction) return notFound();

  // Get a fallback actor for logging
  const { data: actors } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)
    .limit(1);
  const fallbackActorId = actors?.[0]?.id || orgId;

  return (
    <div>
      <Link href="/finances" style={{ display: 'inline-block', marginBottom: '16px', color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>
        ← Back to Ledger
      </Link>
      
      <header className="q-page-header q-row q-row-between">
        <div>
          <h1 className="q-page-title">Transaction Details</h1>
          <p className="q-page-subtitle">{transaction.id}</p>
        </div>
        {transaction.status !== 'settled' && transaction.status !== 'voided' && (
          <SettleTransactionClient transactionId={transaction.id} orgId={orgId} actorId={fallbackActorId} />
        )}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div className="q-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Overview</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <div className="q-meta">Amount</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{transaction.currency?.toUpperCase()} {Number(transaction.amount).toFixed(2)}</div>
            </div>
            <div>
              <div className="q-meta">Status</div>
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
              <div className="q-meta">Type</div>
              <div className="q-cap">{transaction.type.replace(/_/g, ' ')}</div>
            </div>
            <div>
              <div className="q-meta">Direction</div>
              <div>
                <span style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '4px', backgroundColor: transaction.direction === 'inbound' ? 'color-mix(in srgb, var(--q-color-success) 15%, transparent)' : 'color-mix(in srgb, var(--q-color-danger) 13%, transparent)', color: transaction.direction === 'inbound' ? 'var(--q-color-success)' : 'var(--q-color-danger)', fontWeight: 500 }}>
                  {transaction.direction}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="q-stack q-stack-lg">
          <div className="q-card">
            <h3 style={{ fontSize: '1.125rem', marginBottom: '16px' }}>Related Entities</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <div className="q-meta">Client / Person</div>
              <div>{transaction.person ? transaction.person.display_name : 'System Generated'}</div>
            </div>
            
            {transaction.contract && (
              <div>
                <div className="q-meta">Contract</div>
                <Link href={`/contracts/${transaction.contract.id}`} style={{ color: 'var(--q-color-brand-600)', textDecoration: 'none' }}>
                  View Contract (v{transaction.contract.version})
                </Link>
              </div>
            )}
          </div>
          
          <div className="q-card">
            <h3 style={{ fontSize: '1.125rem', marginBottom: '16px' }}>Timeline</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <div className="q-meta">Created At</div>
              <div>{new Date(transaction.created_at).toLocaleString()}</div>
            </div>
            
            {transaction.settled_at && (
              <div>
                <div className="q-meta">Settled At</div>
                <div>{new Date(transaction.settled_at).toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
