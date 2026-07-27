import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { activateContract } from '@/lib/actions/contracts';
import { redirect } from 'next/navigation';

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
      intent:intents(service_template_id),
      person:persons(display_name, email)
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
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '24px 32px', backgroundColor: 'var(--q-color-paper)', borderBottom: '1px solid var(--q-color-ink-100)', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--q-color-ink-900)' }}>{contract.organization?.name}</h1>
      </header>

      <main style={{ flex: 1, padding: '48px 24px', display: 'flex', justifyContent: 'center' }}>
        <div className="q-card" style={{ maxWidth: '600px', width: '100%' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--q-color-ink-900)' }}>Project Proposal & Contract</h2>
          <p style={{ color: 'var(--q-color-ink-600)', marginBottom: '32px' }}>
            Prepared for {contract.person?.display_name}
          </p>

          <div style={{ padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '32px', border: '1px solid var(--q-color-ink-200)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px dashed var(--q-color-ink-300)' }}>
              <span style={{ fontWeight: 500 }}>Base Price</span>
              <span>{terms.currency} {terms.base_price}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontWeight: 500 }}>Required Deposit ({terms.deposit_percentage}%)</span>
              <span>{terms.currency} {(terms.base_price * (terms.deposit_percentage / 100)).toFixed(2)}</span>
            </div>
          </div>

          <div style={{ marginBottom: '32px', fontSize: '0.875rem', color: 'var(--q-color-ink-600)', lineHeight: 1.6 }}>
            <p>By signing below, you agree to the terms and conditions outlined in this document.</p>
          </div>

          {contract.status === 'active' ? (
            <div style={{ padding: '16px', backgroundColor: '#D1FAE5', color: '#065F46', borderRadius: '8px', textAlign: 'center', fontWeight: 500 }}>
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
