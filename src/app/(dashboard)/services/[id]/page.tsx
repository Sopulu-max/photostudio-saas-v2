import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ServiceDetailsPage({ params }: { params: { id: string } }) {
  let orgId: string;
  try {
    const auth = await getAuthOrgId();
    orgId = auth.orgId;
  } catch (error) {
    redirect('/login');
  }

  const { data: service } = await supabaseAdmin
    .from('service_templates')
    .select('*, workflow:workflow_templates(name)')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!service) {
    notFound();
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link href="/services" style={{ color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>
            &larr; Back to Services
          </Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="q-page-title">{service.name}</h1>
            <p className="q-page-subtitle">Service Template Details</p>
          </div>
          <span style={{ 
            padding: '6px 12px', 
            borderRadius: '6px', 
            fontSize: '0.875rem', 
            fontWeight: 600,
            background: service.status === 'active' ? '#D1FAE5' : '#F3F4F6',
            color: service.status === 'active' ? '#065F46' : '#374151'
          }}>
            {service.status.toUpperCase()}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Pricing</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>Base Price</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 500 }}>
                {service.pricing?.base_price ? `$${service.pricing.base_price}` : 'Free'} {service.pricing?.currency || 'USD'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>Pricing Model</div>
              <div style={{ fontSize: '1.125rem', textTransform: 'capitalize' }}>
                {service.pricing?.model || 'Fixed'}
              </div>
            </div>
          </div>
        </div>

        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Workflow Attachment</h2>
          {service.default_workflow_template_id ? (
            <div>
              <div style={{ padding: '12px 16px', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', border: '1px solid var(--q-color-ink-100)' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>{service.workflow?.name || 'Attached Workflow'}</strong>
                <span style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>This workflow will be automatically spawned when a client books this service.</span>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--q-color-ink-500)' }}>
              No default workflow is attached to this service.
            </div>
          )}
        </div>

        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Intake Form Schema</h2>
          {(!service.form_schema || service.form_schema.length === 0) ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>No custom intake fields required.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {service.form_schema.map((field: any, i: number) => (
                <div key={i} style={{ padding: '12px', border: '1px solid var(--q-color-ink-100)', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{field.label}</strong>
                    <span style={{ fontSize: '0.75rem', background: 'var(--q-color-paper-subtle)', padding: '2px 6px', borderRadius: '4px' }}>{field.type}</span>
                  </div>
                  {field.required && <div style={{ fontSize: '0.75rem', color: '#B91C1C', marginTop: '4px' }}>Required</div>}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
