import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getPackage, getIntakeQuestions } from '@/modules/packages/interface';
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

  const pricing: any = pkg.pricing || {};
  const hasPrice = pricing.base_price != null;
  const basePrice = Number(pricing.base_price || 0);
  const paymentPolicy = pkg.payment_policy as 'deposit' | 'full' | null;
  const depositPct = paymentPolicy === 'full' ? 100 : Number(pricing.deposit_percentage || 0);
  const variant = pkg.pricing_variant as { axis_label: string; tiers: { label: string; price: number }[] } | null;

  const services = (pkg as any).services || [];
  const deliverables = (pkg as any).deliverables || [];
  const containers = (pkg as any).containers || [];
  const workflows = (pkg as any).workflows || [];
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
              <div className="q-stat-label">Price</div>
              <div className="q-stat-value">{hasPrice ? formatMoney(basePrice, currencyCode) : '—'}</div>
              {variant && <span className="q-meta-sm">Varies by {variant.axis_label.toLowerCase()}</span>}
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Payment</div>
              <div className="q-stat-value">{paymentPolicy === 'full' ? 'Full price' : paymentPolicy === 'deposit' ? `${depositPct}% deposit` : 'Not set'}</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Duration</div>
              <div className="q-stat-value">{(pkg as any).duration_minutes ? `${(pkg as any).duration_minutes} min` : 'Not set'}</div>
            </div>
          </div>
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Bundled Services</h2>
          {services.length === 0 ? (
            <p className="q-text-meta">No services bundled.</p>
          ) : (
            <div className="q-grid-cards">
              {services.map((s: any) => {
                const allTags = [
                  ...(s.subjects || []), ...(s.occasions || []), ...(s.contexts || []), 
                  ...(s.purposes || []), ...(s.clientTypes || [])
                ];
                return (
                  <div key={s.id} className="q-card q-stack" style={{ borderColor: 'var(--q-color-primary-light)', backgroundColor: 'var(--q-color-paper)' }}>
                    <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <h3 className="q-section-title">{s.name}</h3>
                        <div className="q-meta-sm">{s.domain?.name || 'No domain'}</div>
                      </div>
                      <Package size={20} color="var(--q-color-primary)" />
                    </div>
                    {s.description && <p className="q-meta-sm" style={{ marginTop: '4px' }}>{s.description}</p>}
                    
                    <div style={{ marginTop: '8px' }}>
                      {s.deliverables && s.deliverables.length > 0 && (
                        <div className="q-meta-sm" style={{ marginBottom: '4px' }}>
                          <strong>Produces:</strong> {s.deliverables.map((d: any) => d.name).join(', ')}
                        </div>
                      )}
                      {allTags.length > 0 && (
                        <div className="q-row" style={{ flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                          {allTags.map((t: any) => (
                            <span key={t.id} className="q-badge q-badge-neutral" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{t.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* What this package fixes. Anything the services declare but the
            package leaves open is asked at booking, so it is absent here. */}
        {((pkg as any).variableValues || []).length > 0 && (
          <div className="q-card q-section">
            <h2 className="q-section-title">What&rsquo;s included</h2>
            <div className="q-row" style={{ flexWrap: 'wrap', marginTop: '12px' }}>
              {((pkg as any).variableValues as any[]).map((v) => (
                <span key={v.serviceVariableId} className="q-badge q-badge-neutral">
                  {v.label}: {formatVariableValue(v)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="q-grid-2">
          <div className="q-card q-section">
            <h2 className="q-section-title">Deliverables</h2>
            {deliverables.length === 0 && containers.length === 0 ? (
              <p className="q-text-meta">No deliverables explicitly defined.</p>
            ) : (
              <div className="q-stack q-stack-sm">
                {deliverables.length > 0 && (
                  <div>
                    <div className="q-stat-label" style={{ marginBottom: '8px' }}>Outputs</div>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: 'var(--q-color-ink-700)' }}>
                      {deliverables.map((d: any) => <li key={d.id} style={{ marginBottom: '4px' }}>{d.name}</li>)}
                    </ul>
                  </div>
                )}
                {containers.length > 0 && (
                  <div style={{ marginTop: deliverables.length > 0 ? '16px' : '0' }}>
                    <div className="q-stat-label" style={{ marginBottom: '8px' }}>Delivery Method</div>
                    <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                      {containers.map((d: any) => <span key={d.id} className="q-badge q-badge-neutral">{d.name}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="q-card q-section">
            <h2 className="q-section-title">Production Plan</h2>
            {workflows.length === 0 && extraStages.length === 0 ? (
              <p className="q-text-meta">No standard blueprints or extra stages set.</p>
            ) : (
              <div className="q-stack q-stack-sm">
                {workflows.length > 0 && (
                  <div>
                    <div className="q-stat-label" style={{ marginBottom: '8px' }}>Blueprints</div>
                    <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                      {workflows.map((w: any) => <span key={w.id} className="q-badge q-badge-primary">{w.name}</span>)}
                    </div>
                  </div>
                )}
                {extraStages.length > 0 && (
                  <div style={{ marginTop: workflows.length > 0 ? '16px' : '0' }}>
                    <div className="q-stat-label" style={{ marginBottom: '8px' }}>Extra Stages</div>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: 'var(--q-color-ink-700)' }}>
                      {extraStages.map((s: any, idx: number) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>
                          {s.name} {s.roleName && <span className="q-text-meta">— {s.roleName}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
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
