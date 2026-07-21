import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createAgreement } from '@/lib/actions/agreements';
import { updateIntentStatus } from '@/lib/actions/intents';
import { CopyLinkButton } from './CopyLinkButton';

export default async function IntentDetailsPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = user?.user_metadata?.organization_id;

  const { data: intent } = await supabaseAdmin
    .from('intents')
    .select(`
      *,
      person:persons(*),
      template:service_templates(*)
    `)
    .eq('id', params.id)
    .single();

  if (!intent) notFound();

  // Fetch org slug for portal links
  let orgSlug = 'studio';
  if (orgId) {
    const { data: org } = await supabaseAdmin.from('organizations').select('slug').eq('id', orgId).single();
    if (org?.slug) orgSlug = org.slug;
  }

  // Check if agreement already exists for this intent
  const { data: existingAgreement } = await supabaseAdmin
    .from('agreements')
    .select('id')
    .eq('intent_id', intent.id)
    .maybeSingle();

  const responses = intent.metadata?.form_responses || {};
  const hasResponses = Object.keys(responses).length > 0;

  const handleMarkReviewed = async () => {
    'use server';
    await updateIntentStatus(intent.id, intent.organization_id, 'reviewed', intent.person_id);
    redirect(`/intents/${intent.id}`);
  };

  const handleApprove = async () => {
    'use server';
    try {
      // If agreement already exists, just redirect to it
      if (existingAgreement) {
        redirect(`/agreements/${existingAgreement.id}`);
      }

      // Mark intent reviewed first if needed (so transition is legal: reviewed -> accepted)
      if (intent.status === 'created') {
        await updateIntentStatus(intent.id, intent.organization_id, 'reviewed', intent.person_id);
      }

      const agreement = await createAgreement({
        organizationId: intent.organization_id,
        intentId: intent.id,
        personId: intent.person_id,
        terms: {
          base_price: intent.template?.pricing?.base_price || 0,
          currency: intent.template?.pricing?.currency || 'USD',
          deposit_percentage: intent.template?.pricing?.deposit_percentage || 50,
        },
        actorId: intent.person_id,
      });

      redirect(`/agreements/${agreement.id}`);
    } catch (e: any) {
      if (e.message === 'NEXT_REDIRECT') throw e;
      console.error(e);
      throw new Error('Failed to create agreement');
    }
  };

  const handleDecline = async () => {
    'use server';
    await updateIntentStatus(intent.id, intent.organization_id, 'declined', intent.person_id);
    redirect('/intents');
  };

  const proposalUrl = `/portal/${orgSlug}/proposal/${intent.id}`;

  const statusBadgeColor: Record<string, string> = {
    created: 'q-badge-neutral',
    reviewed: 'q-badge-warning',
    accepted: 'q-badge-success',
    declined: 'q-badge-error',
    withdrawn: 'q-badge-neutral',
    expired: 'q-badge-neutral',
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="q-page-title">Intent Review</h1>
          <p className="q-page-subtitle">Submitted by {intent.person?.display_name}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className={`q-badge ${statusBadgeColor[intent.status] || 'q-badge-neutral'}`}>
            {intent.status}
          </span>
          {intent.status !== 'declined' && intent.status !== 'accepted' && intent.status !== 'withdrawn' && (
            <>
              <form action={handleDecline}>
                <button className="q-btn q-btn-secondary" style={{ color: '#dc2626', borderColor: '#fecaca' }}>Decline</button>
              </form>
              {intent.status === 'created' && (
                <form action={handleMarkReviewed}>
                  <button className="q-btn q-btn-secondary">Mark Reviewed</button>
                </form>
              )}
              <form action={handleApprove}>
                <button className="q-btn q-btn-primary">
                  {existingAgreement ? 'View Agreement →' : 'Approve & Draft Agreement'}
                </button>
              </form>
            </>
          )}
          {existingAgreement && (
            <a href={`/agreements/${existingAgreement.id}`} className="q-btn q-btn-primary">View Agreement →</a>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Client Portal Link */}
        <section className="q-card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Client Proposal Link</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '12px' }}>
            Share this link with the client so they can view the proposal and accept.
          </p>
          <CopyLinkButton url={proposalUrl} />
        </section>

        {/* Client Details */}
        <section className="q-card">
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px' }}>Client Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Name</span>
              <span style={{ fontWeight: 500 }}>{intent.person?.display_name}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Email</span>
              <span style={{ fontWeight: 500 }}>{intent.person?.email || 'N/A'}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Phone</span>
              <span style={{ fontWeight: 500 }}>{intent.person?.phone || 'N/A'}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Source</span>
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{intent.source || 'Direct'}</span>
            </div>
          </div>
        </section>

        {/* Service Requested */}
        <section className="q-card">
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px' }}>Service Requested</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Service Template</span>
              <span style={{ fontWeight: 500, fontSize: '1.125rem' }}>{intent.template?.name || 'Custom Setup'}</span>
            </div>
            {intent.template?.pricing?.base_price && (
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Base Price</span>
                <span style={{ fontWeight: 600, fontSize: '1.25rem' }}>
                  {intent.template.pricing.currency || 'USD'} {intent.template.pricing.base_price.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Form Responses */}
        {hasResponses && (
          <section className="q-card">
            <h2 style={{ fontSize: '1.125rem', marginBottom: '16px' }}>Intake Responses</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Object.entries(responses).map(([key, value]) => (
                <div key={key}>
                  <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>{key}</span>
                  <div style={{ background: 'var(--q-color-ink-50)', padding: '12px', borderRadius: '8px', border: '1px solid var(--q-color-ink-100)' }}>
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

