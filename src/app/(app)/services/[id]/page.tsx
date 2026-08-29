import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getService } from '@/modules/services/interface';
import type { ServiceDimensionTag } from '@/modules/services/interface';
// Composed here rather than reached for: Packages owns `package ↔ service`, and
// Services never reads package tables. The page joins the two modules.
import { listPackagesForService } from '@/modules/packages/interface';
import { Classifications } from './Classifications';

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
  // Fetched by getService all along, and never drawn until now.
  const workflow = dims.workflow as { name: string; tasks: any[] } | null;

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

      <Classifications
        tags={tags as any}
        serviceName={service.name}
        soldNames={soldIn.map((p: any) => p.name)}
      />

      <div className="q-stack q-stack-lg">
        <div className="q-card q-section">
          <h2 className="q-section-title">Deliverables</h2>
          <div className="q-grid-1">
            <div className="q-panel">
              <div className="q-stat-label">Primary deliverable</div>
              <div className="q-stat-value" style={{ fontSize: '1.1rem' }}>
                {dims.primary_deliverable ? (
                  <span className="q-row" style={{ gap: '8px', color: 'var(--q-color-primary)' }}><CheckCircle2 size={18} /> {dims.primary_deliverable.name}</span>
                ) : (
                  <span className="q-text-meta">None</span>
                )}
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: '24px' }}>
            <div className="q-stat-label" style={{ marginBottom: '8px' }}>Additional deliverables</div>
            {!dims.deliverables || dims.deliverables.length === 0 ? (
              <p className="q-empty">
                This service produces only its primary deliverable.
              </p>
            ) : (
              <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: 'var(--q-color-ink-700)' }}>
                {dims.deliverables.map((d: any) => (
                  <li key={d.id} style={{ marginBottom: '4px' }}>{d.name}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/*
          * What varies, and the whole of what was declared about it.
          *
          * This showed a label and a kind. A studio that set a default of 2, a
          * maximum of 6 and a list of choices could not read any of it back
          * here — so the page said less about the service than the studio had
          * told it. Shown whether or not there are any, because "this service
          * varies in no way" is a fact worth seeing rather than a section that
          * silently is not there.
          */}
        <div className="q-card q-section">
          <h2 className="q-section-title">Variables</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            The quantities a package can fix, or leave open for the client to answer when booking.
          </p>
          {!dims.variables || dims.variables.length === 0 ? (
            <p className="q-empty">
              Nothing varies about this service. Every booking of it is the same, unless a package
              says otherwise.
            </p>
          ) : (
            <div className="q-stack q-stack-sm">
              {dims.variables.map((v: any) => {
                const bounds = [
                  v.min != null ? `min ${v.min}` : null,
                  v.max != null ? `max ${v.max}` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <div key={v.id} className="q-tile q-stack q-stack-sm">
                    <div className="q-row q-row-between" style={{ alignItems: 'center' }}>
                      <span className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
                        <strong className="q-strong">{v.label}</strong>
                        {v.unit && <span className="q-meta-sm">({v.unit})</span>}
                      </span>
                      <span className="q-badge q-badge-neutral">{v.kind}</span>
                    </div>
                    {(v.defaultValue != null && v.defaultValue !== '') || bounds || (v.options && v.options.length > 0) ? (
                      <div className="q-meta-sm q-row" style={{ gap: '12px', flexWrap: 'wrap' }}>
                        {v.defaultValue != null && v.defaultValue !== '' && (
                          <span>Defaults to {String(v.defaultValue)}</span>
                        )}
                        {bounds && <span>{bounds}</span>}
                        {v.options && v.options.length > 0 && (
                          <span>Choices: {v.options.join(', ')}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/*
          * How the work gets done.
          *
          * getService has always fetched the workflow and its tasks; this page
          * simply never drew them. So a studio could define a production
          * sequence and then find no trace of it on the service that runs it —
          * which is also why nobody noticed no service had one.
          *
          * This is the chain that ends in someone being put on a job: a task
          * here carries the role it needs, a package bundling this service
          * copies those tasks in, and a booking of that package copies them
          * again. No workflow means no tasks means nobody can be assigned.
          */}
        <div className="q-card q-section">
          <h2 className="q-section-title">Workflow</h2>
          {!workflow || (workflow.tasks || []).length === 0 ? (
            <>
              <p className="q-empty">
                No workflow defined, so this service produces no tasks — and a booking that includes
                it has no work to assign anyone to.
              </p>
              <p className="q-meta-sm" style={{ marginTop: '12px' }}>
                Add one on this service&rsquo;s edit page, or for the whole {dims.domain?.name || 'domain'} domain in{' '}
                <Link href="/services/settings" className="q-link">Services settings</Link>. Packages
                that already bundle this service pick the tasks up automatically.
              </p>
            </>
          ) : (
            <>
              <p className="q-meta" style={{ marginBottom: '16px' }}>
                {workflow.name} &mdash; {workflow.tasks.length}{' '}
                {workflow.tasks.length === 1 ? 'step' : 'steps'}, in order. A package bundling this
                service starts from these, and can rename, re-role or switch off any of them.
              </p>
              <div className="q-stack q-stack-sm">
                {workflow.tasks.map((t: any, i: number) => (
                  <div key={`${t.name}-${i}`} className="q-tile q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                    <span className="q-row" style={{ gap: '10px', alignItems: 'flex-start' }}>
                      <span className="q-meta-sm q-num" style={{ minWidth: '1.2rem' }}>{i + 1}</span>
                      <span>
                        <strong className="q-strong">{t.name}</strong>
                        {t.description && (
                          <span className="q-meta-sm" style={{ display: 'block' }}>{t.description}</span>
                        )}
                      </span>
                    </span>
                    <span className="q-badge q-badge-neutral">{t.roleName || 'No role'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/*
          * Where this is sold — `package ↔ service`, read from this end.
          *
          * A service is what the studio knows how to do; whether any of it is
          * currently sellable is a different question, and until now it had no
          * answer anywhere. Nothing new is stored: the packages already say
          * what they bundle.
          */}
        <div className="q-card q-section">
          <h2 className="q-section-title">Packages</h2>
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
