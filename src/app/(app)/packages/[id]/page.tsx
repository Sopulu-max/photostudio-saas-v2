import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { formatDeliverable, getPackage } from '@/modules/packages/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { formatVariableValue } from '@/modules/services/interface';
import { Package } from 'lucide-react';
import { Classifications } from './Classifications';

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
          <h2 className="q-section-title">Commercial terms</h2>
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
          <h2 className="q-section-title">Deliverables</h2>
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
          <h2 className="q-section-title">Services</h2>
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

        <Classifications services={services} />

        <div className="q-card q-section">
          <h2 className="q-section-title">Variables</h2>
          {(() => {
            /*
             * What this package fixes, and what it leaves open.
             *
             * BOTH HALVES, because a variable left open is not an absence — it
             * is a question the client answers at booking, and a studio reading
             * this page needs to know which of the two a variable is. Only what
             * was fixed appeared here, so a service whose variables were all
             * open read as having none at all.
             *
             * Attribution only where there is more than one service to
             * attribute to, and every bundled service listed including one that
             * fixes nothing — the same rule the deliverables above follow.
             */
            if (services.length === 0) return <p className="q-text-meta">No services bundled.</p>;

            const openFor = (s: any) => {
              const fixed = new Set((s.variableValues || []).map((v: any) => v.serviceVariableId));
              return (s.variables || []).filter((v: any) => !fixed.has(v.id));
            };
            const anything = services.some((s: any) => (s.variableValues || []).length > 0 || openFor(s).length > 0);
            if (!anything) return <p className="q-text-meta">Nothing varies about the bundled services.</p>;

            return (
              <div className="q-stack q-stack-lg">
                {services.map((s: any) => {
                  const fixedValues = s.variableValues || [];
                  const open = openFor(s);
                  return (
                    <div key={s.id} className="q-stack q-stack-sm">
                      {services.length > 1 && <h3 className="q-strong">{s.name}</h3>}
                      {fixedValues.length === 0 && open.length === 0 && (
                        <p className="q-text-meta">Nothing varies about this service.</p>
                      )}
                      {fixedValues.map((v: any) => (
                        <div key={v.serviceVariableId} className="q-row q-row-between q-tile">
                          <span className="q-meta-plain">{v.label}</span>
                          <span className="q-strong">{formatVariableValue(v)}</span>
                        </div>
                      ))}
                      {open.map((v: any) => (
                        <div key={v.id} className="q-row q-row-between q-tile">
                          <span className="q-meta-plain">{v.label}</span>
                          <span className="q-meta">Asked at booking</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Tasks</h2>
          {(() => {
            /*
             * Every bundled service, including one that involves no work yet.
             *
             * A service with no workflow was dropped from this list entirely,
             * and that is the one case a studio most needs to see: a booking of
             * this package produces no tasks for that service, so nobody can be
             * put on the job and nothing reaches the work board.
             */
            if (services.length === 0) return <p className="q-text-meta">No services bundled.</p>;
            const anyWork = services.some((s: any) => (s.tasks || []).length > 0);

            return (
              <div className="q-stack q-stack-lg">
                {!anyWork && (
                  <p className="q-text-meta">
                    No tasks, so a booking of this package produces no work and nobody can be assigned to it.
                  </p>
                )}
                {services.map((s: any) => {
                  const tasks = s.tasks || [];
                  return (
                    <div key={s.id} className="q-stack q-stack-sm">
                      {services.length > 1 && <h3 className="q-strong">{s.name}</h3>}
                      {s.workflow?.name && <span className="q-eyebrow">{s.workflow.name}</span>}
                      {tasks.length === 0 ? (
                        <p className="q-text-meta">
                          No workflow defines how {s.name} is produced, and this package adds no step of its own.
                        </p>
                      ) : tasks.map((t: any) => (
                        <div key={t.id} className="q-row q-row-between q-tile">
                          <span className={t.isActive ? 'q-text-body' : 'q-text-struck'}>{t.name}</span>
                          <div className="q-row q-row-sm">
                            {/* A step this package added rather than inherited.
                                It will not be rewritten when the service
                                workflow changes, which is worth seeing. */}
                            {!t.workflowTaskId && <span className="q-meta-sm">This package only</span>}
                            {t.roleName && <span className="q-badge q-badge-neutral">{t.roleName}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>


      </div>
    </div>
  );
}
