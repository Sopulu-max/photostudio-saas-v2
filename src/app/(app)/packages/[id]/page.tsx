import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { formatDeliverable, getPackage, getIntakeQuestions } from '@/modules/packages/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { formatVariableValue } from '@/modules/services/interface';
import { Package, HelpCircle } from 'lucide-react';

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

  const [currencyCode, questions] = await Promise.all([
    getStudioCurrency(),
    getIntakeQuestions(params.id)
  ]);

  const services = (pkg as any).services || [];
  const containers = (pkg as any).containers || [];
  const extraStages = (pkg as any).extra_stages || [];

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
          <h2 className="q-section-title">At a glance</h2>
          <div className="q-grid-3">
            <div className="q-panel">
              <div className="q-stat-label">Duration</div>
              <div className="q-stat-value">{(pkg as any).duration_minutes ? `${(pkg as any).duration_minutes} min` : 'Not set'}</div>
            </div>
          </div>
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Bundled Services</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>What this package delivers, derived from its services.</p>
          {services.length === 0 ? (
            <p className="q-text-meta">No services bundled.</p>
          ) : (
            <div className="q-stack q-stack-md">
              {services.map((s: any) => {
                const serviceVariables = s.variableValues || [];
                const promises = s.deliverables || [];
                const serviceWorkflows = s.workflows || [];
                const serviceTags = (s.dimensions || []).flatMap((d: any) => d.values);

                return (
                  <div key={s.id} className="q-card q-stack" style={{ borderColor: 'var(--q-color-primary)', backgroundColor: 'var(--q-color-paper)', padding: '16px' }}>
                    <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <h3 className="q-section-title">{s.name}</h3>
                        <div className="q-meta-sm">{s.domain?.name || 'No domain'}</div>
                      </div>
                      <Package size={20} color="var(--q-color-primary)" />
                    </div>
                    {s.description && <p className="q-text-body" style={{ marginTop: '8px', color: 'var(--q-color-ink-700)' }}>{s.description}</p>}
                    
                    {serviceTags.length > 0 && (
                      <div className="q-row" style={{ flexWrap: 'wrap', gap: '4px', marginTop: '12px' }}>
                        {serviceTags.map((t: any) => (
                          <span key={t.id} className="q-badge q-badge-neutral" style={{ fontSize: '0.7rem' }}>{t.name}</span>
                        ))}
                      </div>
                    )}

                    <div className="q-grid-cards" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--q-color-ink-100)' }}>
                      {/* Variables */}
                      {serviceVariables.length > 0 && (
                        <div className="q-stack q-stack-sm">
                          <h4 className="q-strong">Included in this bundle</h4>
                          <div className="q-stack" style={{ gap: '4px' }}>
                            {serviceVariables.map((v: any) => (
                              <div key={v.serviceVariableId} className="q-row q-row-between q-tile" style={{ padding: '8px 12px' }}>
                                <span className="q-meta-plain">{v.label}</span>
                                <span className="q-strong">{formatVariableValue(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {promises.length > 0 && (
                        <div className="q-stack q-stack-sm">
                          <h4 className="q-strong">Outputs promised</h4>
                          <div className="q-stack" style={{ gap: '4px' }}>
                            {promises.map((d: any) => (
                              <div key={d.id} className="q-tile" style={{ padding: '8px 12px' }}>
                                <div className="q-strong">{d.name}</div>
                                {(d.quantity || d.spec) && (
                                  <div className="q-meta-sm" style={{ marginTop: '2px' }}>
                                    Reads as: {formatDeliverable(d)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {serviceWorkflows.length > 0 && (
                        <div className="q-stack q-stack-sm">
                          <h4 className="q-strong">How it is produced</h4>
                          <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                            {serviceWorkflows.map((w: any) => (
                              <span key={w.id} className="q-badge q-badge-primary">{w.name}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {((pkg as any).dimensions || []).length > 0 && (
          <div className="q-card q-section">
            <h2 className="q-section-title">Classifications</h2>
            <div className="q-grid-3">
              {((pkg as any).dimensions as any[]).map(d => (
                <div key={d.id} className="q-panel">
                  <div className="q-stat-label">{d.name}</div>
                  <div className="q-row" style={{ flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                    {d.values.map((v: any) => <span key={v.id} className="q-badge q-badge-neutral">{v.name}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="q-grid-2">
          <div className="q-card q-section">
            <h2 className="q-section-title">Delivery</h2>
            <p className="q-meta" style={{ marginBottom: '16px' }}>How the outputs reach the client.</p>
            {containers.length === 0 ? (
              <p className="q-text-meta">No delivery containers set.</p>
            ) : (
              <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                {containers.map((d: any) => <span key={d.id} className="q-badge q-badge-neutral">{d.name}</span>)}
              </div>
            )}
          </div>
          <div className="q-card q-section">
            <h2 className="q-section-title">Extra Stages</h2>
            <p className="q-meta" style={{ marginBottom: '16px' }}>Work this package adds beyond its services&apos; blueprints.</p>
            {extraStages.length === 0 ? (
              <p className="q-text-meta">No extra stages set.</p>
            ) : (
              <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: 'var(--q-color-ink-700)' }}>
                {extraStages.map((s: any, idx: number) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    {s.name} {s.roleName && <span className="q-text-meta">— {s.roleName}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {questions.length > 0 && (
          <div className="q-card q-section">
            <div className="q-row" style={{ alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <HelpCircle size={20} className="q-text-meta" />
              <h2 className="q-section-title" style={{ margin: 0 }}>Intake Questions ({questions.length})</h2>
            </div>
            <div className="q-stack q-stack-sm">
              {questions.map((q: any, i: number) => (
                <div key={q.id || i} className="q-panel" style={{ padding: '12px' }}>
                  <div style={{ fontWeight: 500, color: 'var(--q-color-ink-900)' }}>{q.question}</div>
                  <div className="q-row" style={{ marginTop: '4px', gap: '12px' }}>
                    <span className="q-meta-sm">Type: {q.type}</span>
                    {q.required && <span className="q-badge q-badge-neutral" style={{ padding: '0 4px', fontSize: '0.65rem' }}>Required</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
