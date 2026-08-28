import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { signContract } from '@/modules/contracts/interface';
import { formatMoney } from '@/kernel/currency';
import { redirect } from 'next/navigation';
import { SignaturePad } from './SignaturePad';

export const dynamic = 'force-dynamic';

export default async function ClientContractPortalPage(props: {
  params: Promise<{ orgSlug: string, id: string }>
}) {
  const params = await props.params;

  // Resolve the studio from the slug and require the contract to belong to it —
  // the orgSlug in the URL must actually own this contract.
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('slug', params.orgSlug)
    .maybeSingle();
  if (!org) notFound();

  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select(`
      *,
      organization:organizations(name),
      person:contacts(display_name, email)
    `)
    .eq('id', params.id)
    .eq('organization_id', org.id)
    .single();

  if (!contract || contract.status === 'completed' || contract.status === 'cancelled') {
    notFound();
  }

  const terms = contract.terms as any;

  async function handleSign(signatureName: string, signatureDataUrl: string) {
    'use server';
    // The client's own door: it reads the studio and the signer off the
    // contract itself rather than believing anything the page passes in.
    await signContract({
      contractId: contract.id,
      signatureName,
      signatureDataUrl,
    });

    // Signing raises the deposit, as a real invoice with a number the client
    // can quote back. It used to raise a bare transaction and send them to a
    // page that rendered it as if it were a document.
    /*
     * Signing always produces something to pay.
     *
     * A deposit of nothing used to mean no invoice at all: the client signed,
     * was sent back to the storefront, and heard nothing further. And "nothing"
     * is the state every studio is in until somebody sets a deposit — one of
     * them has a terms template reading "A 50% deposit is required to confirm
     * this booking" while the system asks for zero, because the sentence is
     * prose and the percentage is a setting nobody filled in.
     *
     * No deposit configured does not mean nothing is owed. It means the whole
     * amount is, so that is what gets raised.
     */
    const depositPercentage = Number(terms.deposit_percentage) || 0;
    const basePrice = Number(terms.base_price) || 0;
    const takingDeposit = depositPercentage > 0 && depositPercentage < 100;
    const depositAmount = takingDeposit ? basePrice * (depositPercentage / 100) : basePrice;

    let token: string | null = null;
    if (depositAmount > 0) {
      const { issueDepositInvoice } = await import('@/modules/finances/interface');
      try {
        const result = await issueDepositInvoice({
          organizationId: org.id,
          bookingId: contract.booking_id,
          contactId: contract.contact_id,
          contractId: contract.id,
          label: takingDeposit ? `${depositPercentage}% deposit` : 'Full payment',
          amount: depositAmount,
          currency: terms.currency || 'USD',
        });
        token = result.token;
      } catch (err) {
        // A failed deposit must not swallow the signature — the contract is
        // already active, and the studio can raise the invoice by hand.
        console.error('Failed to raise deposit invoice:', err);
      }
    }

    if (token) {
      redirect(`/invoice/${token}`);
    } else {
      redirect(`/storefront/${params.orgSlug}?success=contract_signed`);
    }
  }

  return (
    <div className="q-public">
      <header className="q-public-header">
        <h1 className="q-stat-value">{contract.organization?.name}</h1>
      </header>

      <main style={{ flex: 1, padding: '48px 24px', display: 'flex', justifyContent: 'center' }}>
        <div className="q-card" style={{ maxWidth: '600px', width: '100%' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--q-color-ink-900)' }}>Project Proposal & Contract</h2>
          <p className="q-muted">
            Prepared for {contract.person?.display_name}
          </p>

          {Array.isArray(terms.line_items) && terms.line_items.length > 0 && (
            <div className="q-panel" style={{ marginBottom: '20px' }}>
              {terms.line_items.map((li: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < terms.line_items.length - 1 ? '1px dashed var(--q-color-ink-200)' : undefined }}>
                  <div>
                    <span>{li.title}</span>
                    {(li.quantity !== 1 || li.unit) && (
                      <div className="q-meta-sm">
                        {formatMoney(li.unitPrice, terms.currency)}{li.unit ? ` × ${li.quantity} ${li.unit}${li.quantity === 1 ? '' : 's'}` : ` × ${li.quantity}`}
                      </div>
                    )}
                  </div>
                  <span className="q-strong">{formatMoney(li.total, terms.currency)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="q-panel" style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px dashed var(--q-color-ink-300)' }}>
              <span className="q-strong">Base Price</span>
              <span>{formatMoney(terms.base_price, terms.currency)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span className="q-strong">Required Deposit ({terms.deposit_percentage}%)</span>
              <span>{formatMoney(terms.base_price * (terms.deposit_percentage / 100), terms.currency)}</span>
            </div>
          </div>

          {terms.agreement_text && (
            <div style={{ marginBottom: '32px', fontSize: '0.875rem', color: 'var(--q-color-ink-700)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {terms.agreement_text}
            </div>
          )}

          <div style={{ marginBottom: '32px', fontSize: '0.875rem', color: 'var(--q-color-ink-600)', lineHeight: 1.6 }}>
            <p>By signing below, you agree to the terms {terms.agreement_text ? 'above' : 'and conditions outlined in this document'}.</p>
          </div>

          {contract.status === 'active' ? (
            <div className="q-note q-note-good q-stack" style={{ textAlign: 'center' }}>
              <div className="q-strong">Contract Signed. Awaiting Deposit.</div>
              {terms.signature && (
                <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'var(--q-color-ground)', borderRadius: '8px', border: '1px solid var(--q-color-border)' }}>
                  <img src={terms.signature.dataUrl} alt={`Signature of ${terms.signature.name}`} style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto', maxHeight: '100px' }} />
                  <div className="q-meta-sm" style={{ marginTop: '12px' }}>
                    Signed by {terms.signature.name} on {new Date(terms.signature.timestamp).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <SignaturePad onSign={handleSign} />
          )}
        </div>
      </main>
    </div>
  );
}
