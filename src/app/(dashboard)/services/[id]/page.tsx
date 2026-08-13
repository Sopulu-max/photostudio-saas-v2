import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getService } from '@/modules/services/interface';
import type { ServiceDimensionTag } from '@/modules/services/interface';
import { DimensionTag } from '../DimensionTag';
import { CheckCircle2, CircleDashed } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ServiceDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const service = await getService(params.id);
  if (!service) notFound();

  const dims = service as any;
  // However many dimensions this service's domain asks, and however many values
  // it carries under each — read straight off the row rather than reconstructed
  // from a fixed list the studio can't extend.
  const tags = (dims.dimensions || []) as ServiceDimensionTag[];

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href="/services">&larr; Back to Services</Link>
      
      <header className="q-page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="q-row" style={{ alignItems: 'center', gap: '12px' }}>
            <h1 className="q-page-title">{service.name}</h1>
            <span className={`q-badge ${service.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
              {service.status}
            </span>
          </div>
          <p className="q-page-subtitle" style={{ marginTop: '4px' }}>
            {dims.domain?.name || 'No domain'}
          </p>
        </div>
        <Link href={`/services/${service.id}/edit`} className="q-btn q-btn-secondary">
          Edit service
        </Link>
      </header>

      {dims.description && (
        <p className="q-text-body" style={{ marginBottom: '24px', fontSize: '1.05rem', color: 'var(--q-color-ink-700)' }}>
          {dims.description}
        </p>
      )}

      {tags.length > 0 && (
        <div className="q-row" style={{ flexWrap: 'wrap', marginBottom: '32px', gap: '6px' }}>
          {tags.flatMap((d) =>
            d.values.map((v) => <DimensionTag key={v.id} dimension={d.name} value={v} />)
          )}
        </div>
      )}

      <div className="q-stack q-stack-lg">
        <div className="q-card q-section">
          <h2 className="q-section-title">Inputs & Deliverables</h2>
          <div className="q-grid-1">
            <div className="q-panel">
              <div className="q-stat-label">Primary Output</div>
              <div className="q-stat-value" style={{ fontSize: '1.1rem' }}>
                {dims.primary_deliverable ? (
                  <span className="q-row" style={{ gap: '8px', color: 'var(--q-color-primary)' }}><CheckCircle2 size={18} /> {dims.primary_deliverable.name}</span>
                ) : (
                  <span className="q-text-meta">None</span>
                )}
              </div>
            </div>
          </div>
          
          {dims.deliverables && dims.deliverables.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <div className="q-stat-label" style={{ marginBottom: '8px' }}>Additional Deliverables</div>
              <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: 'var(--q-color-ink-700)' }}>
                {dims.deliverables.map((d: any) => (
                  <li key={d.id} style={{ marginBottom: '4px' }}>{d.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
