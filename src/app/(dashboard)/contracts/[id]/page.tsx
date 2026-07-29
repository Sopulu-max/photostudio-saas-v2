import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';
import { FileText, Play } from 'lucide-react';
import { ActivateContractButton } from './ContractActions';

export const dynamic = 'force-dynamic';

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

function money(amount: number, currency: string) {
  const sym = CURRENCY_SYMBOL[currency] || '';
  return `${sym}${Number(amount || 0).toLocaleString()} ${currency}`;
}

export default async function ContractDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { orgId, personId } = await getAuthOrgId();

  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select(`
      *,
      person:contacts(display_name, email),
      booking:bookings(id, title)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!contract) notFound();

  const { data: transactions } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, type, direction, amount, currency, status')
    .eq('organization_id', orgId)
    .eq('contract_id', contract.id)
    .order('created_at', { ascending: true });

  const terms = contract.terms || {};
  const basePrice = terms.base_price || 0;
  const depositPercent = terms.deposit_percentage || 0;
  const currency = terms.currency || 'USD';
  const depositAmount = (basePrice * depositPercent) / 100;

  const isProposed = ['proposed', 'modified'].includes(contract.status);
  const isActive = contract.status === 'active';

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link className="q-back" href="/contracts">
            &larr; Back to Contracts
          </Link>
        </div>
        <div className="q-row q-row-between">
          <div>
            <h1 className="q-page-title">Contract v{contract.version}</h1>
            <p className="q-page-subtitle">Client: {contract.person?.display_name}</p>
          </div>
          <span className={`q-badge ${isActive ? 'q-badge-success' : 'q-badge-neutral'}`}>
            {contract.status.toUpperCase()}
          </span>
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        {/* Ignition — the deliberate step that starts the production engine. */}
        {isProposed && (
          <div className="q-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '24px', borderColor: 'color-mix(in srgb, var(--q-color-accent) 40%, transparent)' }}>
            <div>
              <h3 className="q-section-title">Activate this contract</h3>
              <p className="q-meta">
                Marks the contract active and signed. Nothing else is created automatically — add work or an invoice from the booking whenever you're ready.
              </p>
            </div>
            <ActivateContractButton contractId={contract.id} orgId={orgId} actorId={personId ?? ''} />
          </div>
        )}

        {/* Terms */}
        <div className="q-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h3 className="q-section-title">Terms &amp; Proposal</h3>
              <p className="q-meta">
                The formal terms agreed upon for this production.
              </p>
            </div>
            <button className="q-btn q-btn-secondary">
              <FileText size={16} style={{ marginRight: '8px' }} />
              View Document
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '8px' }}>
            <div className="q-panel">
              <div className="q-stat-label">Total</div>
              <div className="q-stat-value">{money(basePrice, currency)}</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Deposit</div>
              <div className="q-stat-value">{depositPercent}%</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Due now</div>
              <div className="q-stat-value">{money(depositAmount, currency)}</div>
            </div>
          </div>
        </div>

        {/* Money the cascade produced */}
        {transactions && transactions.length > 0 && (
          <div className="q-card">
            <h2 className="q-section-title">Invoices &amp; Payments</h2>
            <div className="q-stack">
              {transactions.map((tx: any) => (
                <div className="q-tile q-row q-row-between" key={tx.id}>
                  <div>
                    <strong className="q-block q-cap">{String(tx.type).replace(/_/g, ' ')}</strong>
                    <span className={`q-badge ${tx.status === 'settled' ? 'q-badge-success' : 'q-badge-warning'}`}>{tx.status}</span>
                  </div>
                  <div className="q-row">
                    <span className="q-stat-value">{money(tx.amount, tx.currency)}</span>
                    <Link href={`/finances/${tx.id}`} className="q-btn q-btn-secondary q-meta-plain">
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The booking this contract belongs to — work lives there, per line. */}
        {contract.booking && (
          <div className="q-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', margin: '0 0 4px', fontWeight: 600 }}>Booking</h2>
              <span className="q-meta">{contract.booking.title}</span>
            </div>
            <Link href={`/bookings/${contract.booking.id}`} className="q-btn q-btn-primary">
              <Play size={16} style={{ marginRight: '8px' }} />
              Open booking
            </Link>
          </div>
        )}


      </div>
    </div>
  );
}
