import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { activateContract } from '@/modules/contracts/interface';
import { formatMoney } from '@/kernel/currency';
import { redirect } from 'next/navigation';

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

  async function handleSign() {
    'use server';
    await activateContract(contract.id);
    // In real app, redirect to a thank you or deposit payment page
    redirect(`/portal/${params.orgSlug}/payment/${contract.id}`);
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
            <div className="q-note q-note-good q-center-text q-strong">
              Contract Signed. Awaiting Deposit.
            </div>
          ) : (
            <form action={handleSign}>
              <button type="submit" className="q-btn q-btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1.125rem' }}>
                Accept & Sign Contract
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
