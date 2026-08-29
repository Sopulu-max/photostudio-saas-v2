import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { formatDeliverable, getPackage } from '@/modules/packages/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { formatVariableValue } from '@/modules/services/interface';
import { Package } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PackageDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const pkg = await getPackage(params.id);
  if (!pkg) notFound();

  const [currencyCode] = await Promise.all([
    getStudioCurrency(),
  ]);

  const services = (pkg as any).services || [];

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href="/packages">&larr; Back to Packages</Link>
      
      <header className="q-page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="q-row" style={{ alignItems: 'center', gap: '12px' }}>
            <h1 className="q-page-title">{pkg.name}</h1>
            <span className={`q-badge ${pkg.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
              {pkg.status}
            </span>
          </div>
          <p className="q-page-subtitle" style={{ marginTop: '4px' }}>
            What the client buys, and what it costs.
          </p>
        </div>
        <Link href={`/packages/${pkg.id}/edit`} className="q-btn q-btn-secondary">
          Edit package
        </Link>
      </header>

      {pkg.description && (
        <p className="q-text-body" style={{ marginBottom: '24px', fontSize: '1.05rem', color: 'var(--q-color-ink-700)' }}>
          {pkg.description}
        </p>
      )}

      <div className="q-stack q-stack-lg">
        <div className="q-card q-section">
          <h2 className="q-section-title">1. Commercial Terms</h2>
          <div className="q-grid-halves" style={{ marginTop: '16px' }}>
            <div>
              <span className="q-meta-sm" style={{ display: 'block', marginBottom: '4px' }}>Base Price</span>
              <div className="q-stat-value">
                {pkg.price?.amount != null 
                  ? formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode)) 
                  : 'Unpriced'}
              </div>
            </div>
            {pkg.duration_minutes != null && (
              <div>
                <span className="q-meta-sm" style={{ display: 'block', marginBottom: '4px' }}>Expected Duration</span>
                <div className="q-text-body">{pkg.duration_minutes} minutes</div>
              </div>
            )}
          </div>
        </div>
        
        <div className="q-card q-section">
          <h2 className="q-section-title">2. Deliverables</h2>
          {(() => {
            /*
             * Deliverables hang off each bundled service, not off the package,
             * so a bundle of two services has two sets of them and the page has
             * to say which produces what.
             *
             * BUT ONLY WHEN THERE IS MORE THAN ONE. Every package here bundles a
             * single service today, and each was printing "From Portrait
             * Photography" beneath a heading that could not have meant anything
             * else. One service, no attribution.
             *
             * AND EVERY BUNDLED SERVICE IS LISTED, including one that promises
             * nothing. Filtering those out hid the gap an operator most needs to
             * see: a Wedding package whose videography half has no deliverables
             * set reads as finished when the empty half is simply not drawn.
             */
            if (services.length === 0) return <p className="q-text-meta">No services bundled.</p>;

            const tiles = (s: any) => (
              <div className="q-grid-cards">
                {s.deliverables.map((d: any) => (
                  <div key={d.id} className="q-tile" style={{ padding: '8px 12px' }}>
                    <div className="q-strong">{formatDeliverable(d)}</div>
                  </div>
                ))}
              </div>
            );

            const total = services.reduce((n: number, s: any) => n + (s.deliverables?.length || 0), 0);
            if (total === 0) return <p className="q-text-meta">No deliverables set for this package.</p>;
            if (services.length === 1) return tiles(services[0]);

            return (
              <div className="q-stack q-stack-md">
                {services.map((s: any) => (
                  <div key={s.id} className="q-stack q-stack-sm">
                    <span className="q-eyebrow">{s.name}</span>
                    {s.deliverables?.length
                      ? tiles(s)
                      : <p className="q-text-meta">No deliverables set.</p>}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">3. Bundled Services</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>The raw services this package is built from.</p>
          {services.length === 0 ? (
            <p className="q-text-meta">No services bundled.</p>
          ) : (
            <div className="q-grid-cards">
              {services.map((s: any) => (
                <div key={s.id} className="q-card q-stack" style={{ borderColor: 'var(--q-color-primary)', backgroundColor: 'var(--q-color-primary-light)', padding: '16px' }}>
                  <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <h3 className="q-section-title">{s.name}</h3>
                      <div className="q-meta-sm">{s.domain?.name || 'No domain'}</div>
                    </div>
                    <Package size={20} color="var(--q-color-primary)" />
                  </div>
                  {s.description && <p className="q-meta-sm" style={{ marginTop: '4px' }}>{s.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">4. Classifications</h2>
          {services.length === 0 ? (
            <p className="q-text-meta">No services bundled.</p>
          ) : (
            <div className="q-stack q-stack-md">
              {services.filter((s: any) => s.narrowedTo && s.narrowedTo.length > 0).length === 0 ? (
                <p className="q-text-meta">None of the bundled services have classifications.</p>
              ) : (
                services.filter((s: any) => s.narrowedTo && s.narrowedTo.length > 0).map((s: any) => (
                  <div key={s.id} style={{ marginBottom: '16px' }}>
                    <h3 className="q-strong" style={{ marginBottom: '8px' }}>For {s.name}</h3>
                    <div className="q-grid-3">
                      {s.narrowedTo.map((d: any) => (
                        <div key={d.id} className="q-panel">
                          <div className="q-stat-label">{d.name}</div>
                          <div className="q-row" style={{ flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {d.values.map((v: any) => <span key={v.id} className="q-badge q-badge-neutral">{v.name}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">5. Variables</h2>
          {services.length === 0 ? (
            <p className="q-text-meta">No services bundled.</p>
          ) : (
            <div className="q-stack q-stack-md">
              {services.filter((s: any) => s.variableValues && s.variableValues.length > 0).length === 0 ? (
                <p className="q-text-meta">None of the bundled services have variables.</p>
              ) : (
                services.filter((s: any) => s.variableValues && s.variableValues.length > 0).map((s: any) => (
                  <div key={s.id} style={{ marginBottom: '16px' }}>
                    <h3 className="q-strong" style={{ marginBottom: '8px' }}>For {s.name}</h3>
                    <div className="q-grid-cards">
                      
                      <div className="q-stack q-stack-sm">
                        <div className="q-stack" style={{ gap: '4px' }}>
                          {s.variableValues.map((v: any) => (
                            <div key={v.serviceVariableId} className="q-row q-row-between q-tile" style={{ padding: '8px 12px' }}>
                              <span className="q-meta-plain">{v.label}</span>
                              <span className="q-strong">{formatVariableValue(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">6. Tasks</h2>
          {services.length === 0 ? (
            <p className="q-text-meta">No services bundled.</p>
          ) : (
            <div className="q-stack q-stack-md">
              {services.filter((s: any) => s.tasks && s.tasks.length > 0).length === 0 ? (
                <p className="q-text-meta">None of the bundled services have production tasks.</p>
              ) : (
                services.filter((s: any) => s.tasks && s.tasks.length > 0).map((s: any) => (
                  <div key={s.id} style={{ marginBottom: '16px' }}>
                    <h3 className="q-strong" style={{ marginBottom: '2px' }}>For {s.name}</h3>
                    {s.workflow?.name && (
                      <div className="q-meta-sm" style={{ marginBottom: '8px' }}>From workflow: {s.workflow.name}</div>
                    )}
                    <div className="q-grid-cards">
                      
                      <div className="q-stack q-stack-sm">
                        <div className="q-stack" style={{ gap: '4px' }}>
                          {s.tasks.map((t: any) => (
                            <div key={t.id} className="q-row q-row-between q-tile" style={{ padding: '6px 12px', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.9rem', opacity: t.isActive ? 1 : 0.5, textDecoration: t.isActive ? 'none' : 'line-through' }}>
                                {t.name}
                              </span>
                              {t.roleName && (
                                <span className="q-badge q-badge-neutral" style={{ fontSize: '0.75rem' }}>{t.roleName}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>


      </div>
    </div>
  );
}
