import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { IntentActionsClient } from './client';

export const dynamic = 'force-dynamic';

export default async function IntentDetailsPage({ params }: { params: { id: string } }) {
  const { orgId } = await getAuthOrgId();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: intent } = await supabaseAdmin
    .from('intents')
    .select(`
      *,
      person:persons(id, display_name, email),
      template:service_templates(id, name, pricing)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!intent) notFound();

  const responses = intent.metadata?.form_responses;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link href="/intents" style={{ color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>
            &larr; Back to Intents
          </Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="q-page-title">Booking Inquiry</h1>
            <p className="q-page-subtitle">Submitted by {intent.person?.display_name}</p>
          </div>
          <span className={`q-badge ${intent.status === 'approved' ? 'q-badge-success' : intent.status === 'pending' ? 'q-badge-warning' : 'q-badge-neutral'}`}>
            {intent.status.toUpperCase()}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <IntentActionsClient intent={intent} orgId={orgId} actorId={user.id} />

        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Client & Service Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>Client Name</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 500 }}>{intent.person?.display_name}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginTop: '4px' }}>{intent.person?.email}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>Requested Service</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 500 }}>{intent.template?.name || 'Custom Setup'}</div>
            </div>
            <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>Project Description</div>
              <div style={{ padding: '16px', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', border: '1px solid var(--q-color-ink-100)', whiteSpace: 'pre-wrap' }}>
                {intent.description}
              </div>
            </div>
          </div>
        </div>

        {responses && Object.keys(responses).length > 0 && (
          <div className="q-card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Intake Form Responses</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
              {Object.entries(responses).map(([key, value]) => (
                <div key={key} style={{ padding: '12px', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', border: '1px solid var(--q-color-ink-100)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{key}</div>
                  <div style={{ fontWeight: 500 }}>{String(value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
