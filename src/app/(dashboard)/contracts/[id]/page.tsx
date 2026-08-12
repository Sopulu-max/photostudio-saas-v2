import { notFound } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudio } from '@/kernel/organizations';
import { getContract } from '@/modules/contracts/interface';
import { listTransactionsForContract } from '@/modules/finances/interface';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { ActivateContractButton, CancelContractButton } from './ContractActions';
import { ShareContractLink } from './ShareContractLink';
import { TermsEditor } from './TermsEditor';
import { formatMoney } from '@/kernel/currency';

export const dynamic = 'force-dynamic';



export default async function ContractDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { orgId, personId } = await getAuthOrgId();

  const [contract, org] = await Promise.all([getContract(params.id), getStudio()]);
  if (!contract) notFound();

  const transactions = await listTransactionsForContract(contract.id);

  const terms = contract.terms || {};
  const basePrice = terms.base_price || 0;
  const depositPercent = terms.deposit_percentage || 0;
  const currency = terms.currency || 'USD';
  const depositAmount = (basePrice * depositPercent) / 100;
  const lineItems: { title: string; quantity: number; unit: string | null; unitPrice: number; total: number }[] = terms.line_items || [];
  const agreementText: string = terms.agreement_text || '';

  const isProposed = ['proposed', 'modified'].includes(contract.status);
  const isActive = contract.status === 'active';
  const isTerminal = ['completed', 'cancelled'].includes(contract.status);

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
          <div className="q-row">
            <span className={`q-badge ${isActive ? 'q-badge-success' : 'q-badge-neutral'}`}>
              {contract.status.toUpperCase()}
            </span>
            {!isTerminal && <CancelContractButton contractId={contract.id} />}
          </div>
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
            <ActivateContractButton contractId={contract.id} />
          </div>
        )}

        {/* What's actually being agreed to — not just a number. Snapshotted
            from the booking's lines when this contract was drafted, so it
            doesn't silently drift if the booking changes later. */}
        {lineItems.length > 0 && (
          <div className="q-card">
            <h3 className="q-section-title">What&rsquo;s included</h3>
            <div className="q-stack q-stack-sm" style={{ marginTop: '12px' }}>
              {lineItems.map((li, i) => (
                <div key={i} className="q-tile q-row q-row-between">
                  <div>
                    <strong className="q-strong">{li.title}</strong>
                    {(li.quantity !== 1 || li.unit) && (
                      <div className="q-meta">
                        {formatMoney(li.unitPrice, currency)}{li.unit ? ` × ${li.quantity} ${li.unit}${li.quantity === 1 ? '' : 's'}` : ` × ${li.quantity}`}
                      </div>
                    )}
                  </div>
                  <span className="q-num">{formatMoney(li.total, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Terms */}
        <div className="q-card">
          <div style={{ marginBottom: '16px' }}>
            <h3 className="q-section-title">Terms &amp; Proposal</h3>
            <p className="q-meta">
              The formal terms agreed upon for this production.
            </p>
          </div>
          {isTerminal ? (
            <div className="q-stack">
              {agreementText && (
                <p className="q-meta-plain" style={{ whiteSpace: 'pre-wrap', marginBottom: '4px' }}>{agreementText}</p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '8px' }}>
                <div className="q-panel">
                  <div className="q-stat-label">Total</div>
                  <div className="q-stat-value">{formatMoney(basePrice, currency)}</div>
                </div>
                <div className="q-panel">
                  <div className="q-stat-label">Deposit</div>
                  <div className="q-stat-value">{depositPercent}%</div>
                </div>
                <div className="q-panel">
                  <div className="q-stat-label">Due now</div>
                  <div className="q-stat-value">{formatMoney(depositAmount, currency)}</div>
                </div>
              </div>

              {terms.signature && (
                <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'var(--q-color-ground)', borderRadius: '8px', border: '1px dashed var(--q-color-border)' }}>
                  <img src={terms.signature.dataUrl} alt={`Signature of ${terms.signature.name}`} style={{ display: 'block', maxWidth: '100%', height: 'auto', maxHeight: '100px' }} />
                  <div className="q-meta-sm" style={{ marginTop: '12px' }}>
                    Signed by {terms.signature.name} on {new Date(terms.signature.timestamp).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <TermsEditor
              contractId={contract.id}
              agreementText={agreementText}
              basePrice={basePrice}
              depositPercentage={depositPercent}
              currency={currency}
              status={contract.status}
            />
          )}
        </div>

        {/* The client's side of this — the actual thing they open and sign.
            The portal page itself 404s once a contract is completed or
            cancelled, so there's nothing useful to share past that point. */}
        {org?.slug && !isTerminal && (
          <div className="q-card">
            <h3 className="q-section-title">Share with client</h3>
            <p className="q-meta" style={{ marginBottom: '16px' }}>
              This is what {contract.person?.display_name || 'the client'} sees — send it to them to read and sign.
            </p>
            <ShareContractLink orgSlug={org.slug} contractId={contract.id} />
          </div>
        )}

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
                    <span className="q-stat-value">{formatMoney(tx.amount, tx.currency)}</span>
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
