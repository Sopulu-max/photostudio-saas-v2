import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getService } from '@/modules/services/interface';
import type { ServiceDimensionTag } from '@/modules/services/interface';
// Composed here rather than reached for: Packages owns `package ↔ service`, and
// Services never reads package tables. The page joins the two modules.
import { listPackagesForService } from '@/modules/packages/interface';
import { DimensionTag } from '../DimensionTag';
import { CheckCircle2, CircleDashed, Package as PackageIcon } from 'lucide-react';

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

  const soldIn = await listPackagesForService(params.id);

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

        {/* What varies — the quantities a package can fix or leave for the client */}
        {dims.variables && dims.variables.length > 0 && (
          <div className="q-card q-section">
            <h2 className="q-section-title">What varies</h2>
            <p className="q-meta" style={{ marginBottom: '16px' }}>
              These are the quantities a package can fix or leave open for the client to answer at booking time.
            </p>
            <div className="q-stack q-stack-sm">
              {dims.variables.map((v: any, i: number) => (
                <div key={i} className="q-tile q-row q-row-between">
                  <span className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
                    <strong className="q-strong">{v.label}</strong>
                    {v.unit && <span className="q-meta-sm">({v.unit})</span>}
                  </span>
                  <span className="q-badge q-badge-neutral">{v.kind}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/*
          * Where this is sold — `package ↔ service`, read from this end.
          *
          * A service is what the studio knows how to do; whether any of it is
          * currently sellable is a different question, and until now it had no
          * answer anywhere. Nothing new is stored: the packages already say
          * what they bundle.
          */}
        <div className="q-card q-section">
          <h2 className="q-section-title">Where it&rsquo;s sold</h2>
          {soldIn.length === 0 ? (
            <p className="q-empty">
              Nothing bundles {service.name} yet, so a client can&rsquo;t buy it. A service is what you know
              how to do; a package is how it gets sold.
            </p>
          ) : (
            <div className="q-stack q-stack-sm" style={{ marginTop: '12px' }}>
              {soldIn.map((p) => (
                <Link key={p.id} href={`/packages/${p.id}`} className="q-tile q-row q-row-between">
                  <span className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
                    <PackageIcon size={16} opacity={0.5} />
                    <strong className="q-strong">{p.name}</strong>
                  </span>
                  <span className="q-row" style={{ gap: '8px', alignItems: 'center' }}>

                    {p.status === 'retired' && <span className="q-badge q-badge-neutral">retired</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {soldIn.length > 0 && soldIn.every((p) => p.status === 'retired') && (
            <p className="q-meta-sm" style={{ marginTop: '12px', opacity: 0.7 }}>
              Every package bundling this is retired — nothing currently on sale includes it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
