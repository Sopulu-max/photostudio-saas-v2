import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { createAgreement } from '@/lib/actions/agreements';
import { updateIntentStatus } from '@/lib/actions/intents';

export default async function ClientProposalPage({ params }: { params: { orgSlug: string, intentId: string } }) {
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', params.orgSlug)
    .single();

  if (!org) {
    return <div style={{ padding: '48px', textAlign: 'center' }}><h1>Studio Not Found</h1></div>;
  }

  const { data: intent } = await supabaseAdmin
    .from('intents')
    .select('*, person:persons(display_name, id), template:service_templates(name, pricing, default_workflow_template_id)')
    .eq('id', params.intentId)
    .single();

  if (!intent) {
    return <div style={{ padding: '48px', textAlign: 'center' }}><h1>Proposal Not Found</h1></div>;
  }

  // If already accepted, there should be an existing agreement — redirect to it
  if (intent.status === 'accepted') {
    const { data: existingAgreement } = await supabaseAdmin
      .from('agreements')
      .select('id')
      .eq('intent_id', intent.id)
      .single();
    if (existingAgreement) {
      redirect(`/portal/${params.orgSlug}/agreement/${existingAgreement.id}`);
    }
  }

  const pricing = (intent.template?.pricing as any) || {};
  const basePrice = pricing.base_price || 0;
  const depositPct = pricing.deposit_percentage || 25;
  const depositAmount = (basePrice * depositPct / 100);

  async function handleAccept() {
    'use server';
    // 1. Mark intent as accepted (state machine guarded)
    await updateIntentStatus(intent.id, org!.id, 'accepted', intent.person_id);

    // 2. Create the Agreement in 'proposed' state
    const agreement = await createAgreement({
      organizationId: org!.id,
      intentId: intent.id,
      personId: intent.person_id,
      actorId: intent.person_id,
      terms: {
        base_price: basePrice,
        deposit_percentage: depositPct,
        currency: pricing.currency || 'USD',
        service_name: intent.template?.name || 'Custom Service',
      },
    });

    // 3. Redirect to the agreement signing portal
    redirect(`/portal/${params.orgSlug}/agreement/${agreement.id}`);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', fontFamily: 'var(--q-font-body, serif)' }}>
      <header style={{ padding: '24px 32px', backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>{org.name}</h1>
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '48px 24px' }}>
        <div className="q-card" style={{ padding: '40px' }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 400, marginBottom: '8px' }}>Project Proposal</h2>
            <p style={{ color: 'var(--q-color-ink-500)', margin: 0 }}>Prepared for {intent.person?.display_name}</p>
          </div>

          <div style={{ padding: '24px', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', marginBottom: '32px', border: '1px solid var(--q-color-ink-100)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1rem', fontWeight: 600 }}>{intent.template?.name || 'Custom Service'}</h3>
            <p style={{ color: 'var(--q-color-ink-600)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {intent.description || 'A bespoke production package covering the complete workflow from shoot to final delivery.'}
            </p>

            <div style={{ borderTop: '1px dashed var(--q-color-ink-200)', marginTop: '20px', paddingTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.9rem' }}>
                <span>Package Total</span>
                <span style={{ fontWeight: 600 }}>USD {basePrice.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.9rem' }}>
                <span>Deposit Required ({depositPct}%)</span>
                <span style={{ fontWeight: 600 }}>USD {depositAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--q-color-ink-100)', fontWeight: 700, fontSize: '1rem' }}>
                <span>Due to Begin</span>
                <span>USD {depositAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-500)', marginBottom: '24px', lineHeight: 1.6 }}>
            By accepting this proposal, you agree to the project scope and terms above. A deposit invoice will be generated immediately, and production will commence upon receipt of payment.
          </p>

          <form action={handleAccept}>
            <button type="submit" className="q-btn q-btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1rem' }}>
              Accept Proposal & Proceed to Agreement
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
