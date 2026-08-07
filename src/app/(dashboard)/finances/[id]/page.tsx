import { notFound } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getTransaction } from '@/modules/finances/interface';
import { formatMoney } from '@/kernel/currency';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SettleTransactionClient } from './client';
import { CopyInvoiceLinkButton } from '../../bookings/[id]/CopyInvoiceLinkButton';

export const dynamic = 'force-dynamic';

export default async function TransactionDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { orgId, personId: actorId } = await getAuthOrgId();

  const transaction: any = await getTransaction(params.id);
  if (!transaction) return notFound();

  const { data: orgData } = await supabaseAdmin.from('organizations').select('slug').eq('id', orgId).single();
  const orgSlug = orgData?.slug || '';

  const canSettle = transaction.status !== 'settled' && transaction.status !== 'voided';

  return (
    <div className="q-page-narrow">
      <Link href="/finances" className="q-back">&larr; Back to Finances</Link>

      <header className="q-page-header">
        <div>
          <h1 className="q-page-title q-cap">{String(transaction.type).replace(/_/g, ' ')}</h1>
          <p className="q-page-subtitle">{transaction.contact?.display_name || 'No client attached'}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {canSettle ? (
            <>
              <CopyInvoiceLinkButton orgSlug={orgSlug} txId={transaction.id} />
              <SettleTransactionClient transactionId={transaction.id} orgId={orgId} actorId={actorId ?? ''} />
            </>
          ) : transaction.status === 'settled' ? (
            <Link href={`/portal/${orgSlug}/payment/${transaction.id}`} target="_blank" className="q-btn q-btn-secondary">
              View Receipt
            </Link>
          ) : null}
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        <div className="q-card q-section">
          <h2 className="q-section-title">At a glance</h2>
          <div className="q-grid-3">
            <div className="q-panel">
              <div className="q-stat-label">Amount</div>
              <div className="q-stat-value-lg">{formatMoney(transaction.amount, transaction.currency)}</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Direction</div>
              <div className="q-stat-value">
                <span className={`q-badge ${transaction.direction === 'inbound' ? 'q-badge-success' : 'q-badge-danger'}`}>
                  {transaction.direction}
                </span>
              </div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Status</div>
              <div className="q-stat-value">
                <span className={`q-badge ${
                  transaction.status === 'settled' ? 'q-badge-success' :
                  transaction.status === 'pending' ? 'q-badge-warning' :
                  transaction.status === 'voided' ? 'q-badge-danger' : 'q-badge-neutral'
                }`}>
                  {transaction.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Related</h2>
          <div className="q-stack q-stack-sm">
            <div className="q-tile q-row q-row-between">
              <span className="q-meta">Client</span>
              <span className="q-strong">{transaction.contact?.display_name || 'System generated'}</span>
            </div>
            {transaction.contact?.email && (
              <div className="q-tile q-row q-row-between">
                <span className="q-meta">Email</span>
                <span>{transaction.contact.email}</span>
              </div>
            )}
            {transaction.contract && (
              <div className="q-tile q-row q-row-between">
                <span className="q-meta">Contract</span>
                <Link href={`/contracts/${transaction.contract.id}`} className="q-link">
                  View contract v{transaction.contract.version}
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Timeline</h2>
          <div className="q-stack q-stack-sm">
            <div className="q-tile q-row q-row-between">
              <span className="q-meta">Created</span>
              <span>{new Date(transaction.created_at).toLocaleString()}</span>
            </div>
            {transaction.due_date && (
              <div className="q-tile q-row q-row-between">
                <span className="q-meta">Due</span>
                <span>{new Date(transaction.due_date).toLocaleDateString()}</span>
              </div>
            )}
            {transaction.settled_at && (
              <div className="q-tile q-row q-row-between">
                <span className="q-meta">Settled</span>
                <span>{new Date(transaction.settled_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
