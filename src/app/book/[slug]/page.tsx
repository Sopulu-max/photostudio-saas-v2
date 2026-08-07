import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { listPackagesPublic } from '@/modules/packages/interface';
import { formatMoney } from '@/kernel/currency';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, currency')
    .eq('slug', params.slug)
    .maybeSingle();
  if (!org) notFound();

  const packages = await listPackagesPublic(org.id);
  const currencyCode = org.currency || 'USD';

  return (
    <div className="q-public">
      <header className="q-public-header">
        <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 620, letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)' }}>
          {org.name}
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--q-color-ink-500)' }}>
          Pick a package to get started — we&rsquo;ll reach out to confirm the details.
        </p>
      </header>

      <main className="q-public-main q-public-wide">
        {packages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--q-color-ink-400)' }}>
            Nothing available to book right now — check back soon.
          </div>
        ) : (
          <div className="q-grid-cards">
            {packages.map((pkg: any) => {
              const services: string[] = (pkg.services || []).map((s: any) => s.name).filter(Boolean);
              return (
                <Link key={pkg.id} href={`/book/${params.slug}/${pkg.id}`} className="q-card q-card-interactive q-plain-link" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 600, color: 'var(--q-color-ink-900)' }}>{pkg.name}</h3>
                    {pkg.description && (
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)', lineHeight: 1.5 }}>{pkg.description}</p>
                    )}
                  </div>

                  {services.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {services.map((s) => (
                        <span key={s} style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'var(--q-color-ink-100)', borderRadius: '20px', color: 'var(--q-color-ink-600)' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '4px' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--q-color-ink-900)', fontVariantNumeric: 'tabular-nums' }}>
                        {pkg.pricing?.base_price != null
                          ? formatMoney(pkg.pricing.base_price, pkg.pricing.currency || currencyCode)
                          : 'Price on request'}
                      </span>
                      {pkg.price_unit && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-400)', marginLeft: '4px' }}>/{pkg.price_unit}</span>
                      )}
                    </div>
                    <span className="q-btn q-btn-secondary q-btn-sm">Request →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
