import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ServiceDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let orgId: string;
  try {
    const auth = await getAuthOrgId();
    orgId = auth.orgId;
  } catch (error) {
    redirect('/login');
  }

  const { data: service } = await supabaseAdmin
    .from('services')
    .select('*, workflow:blueprints(name)')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!service) {
    notFound();
  }

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link className="q-back" href="/services">
            &larr; Back to Services
          </Link>
        </div>
        <div className="q-row q-row-between">
          <div>
            <h1 className="q-page-title">{service.name}</h1>
            <p className="q-page-subtitle">Service Template Details</p>
          </div>
          <span className={`q-badge ${service.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
            {service.status}
          </span>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        
        <div className="q-card">
          <h2 className="q-section-title">Pricing</h2>
          <div className="q-grid-2">
            <div>
              <div className="q-stat-label">Base Price</div>
              <div className="q-stat-value">
                {service.pricing?.base_price ? `$${service.pricing.base_price}` : 'Free'} {service.pricing?.currency || 'USD'}
              </div>
            </div>
            <div>
              <div className="q-stat-label">Pricing Model</div>
              <div style={{ fontSize: '1.125rem', textTransform: 'capitalize' }}>
                {service.pricing?.model || 'Fixed'}
              </div>
            </div>
          </div>
        </div>

        <div className="q-card">
          <h2 className="q-section-title">Workflow Attachment</h2>
          {service.default_blueprint_id ? (
            <div>
              <div className="q-panel">
                <strong className="q-block">{service.workflow?.name || 'Attached Workflow'}</strong>
                <span className="q-meta">This blueprint is used when you start work on this service from a booking.</span>
              </div>
            </div>
          ) : (
            <div className="q-muted">
              No default workflow is attached to this service.
            </div>
          )}
        </div>

        <div className="q-card">
          <h2 className="q-section-title">Intake Form Schema</h2>
          {(!service.form_schema || service.form_schema.length === 0) ? (
            <div className="q-muted">No custom intake fields required.</div>
          ) : (
            <div className="q-stack">
              {service.form_schema.map((field: any, i: number) => (
                <div className="q-tile" key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{field.label}</strong>
                    <span style={{ fontSize: '0.75rem', background: 'var(--q-color-paper-subtle)', padding: '2px 6px', borderRadius: '4px' }}>{field.type}</span>
                  </div>
                  {field.required && <div className="q-meta-sm q-danger">Required</div>}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
