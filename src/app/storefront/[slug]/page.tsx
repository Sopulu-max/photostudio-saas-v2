import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getStudioBySlug } from '@/kernel/organizations';
import { listPackagesPublic } from '@/modules/packages/interface';
import { formatMoney } from '@/kernel/currency';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;

  const org = await getStudioBySlug(params.slug);
  if (!org) notFound();

  const packages = await listPackagesPublic(org.id);
  const currencyCode = org.currency || 'USD';
  const meta = (org.metadata || {}) as Record<string, any>;

  return (
    <div className="q-app-surface">
      {meta.cover_url && (
        <div style={{ width: '100%', height: '240px', backgroundImage: `url(${meta.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}
      
      <header className="q-page-header" style={{ padding: meta.cover_url ? '32px 24px 64px' : 'clamp(48px, 8vw, 80px) 24px 32px', textAlign: 'center', flexDirection: 'column', alignItems: 'center' }}>
        {meta.logo_url && (
          <div style={{ width: '96px', height: '96px', borderRadius: '50%', backgroundColor: 'var(--q-color-paper)', border: '4px solid var(--q-color-paper-subtle)', backgroundImage: `url(${meta.logo_url})`, backgroundSize: 'cover', backgroundPosition: 'center', margin: meta.cover_url ? '-80px auto 24px' : '0 auto 24px', boxShadow: 'var(--q-shadow-md)' }} />
        )}
        <h1 className="q-page-title">
          {org.name}
        </h1>
        <p className="q-page-subtitle" style={{ maxWidth: '480px', margin: '12px auto 0' }}>
          Explore our offerings and book a session. We&rsquo;ll review your request and get back to you to confirm the details.
        </p>
      </header>

      <main className="q-page-narrow">
        {packages.length === 0 ? (
          <div className="q-card" style={{ textAlign: 'center', padding: '80px 24px' }}>
            <span className="q-meta">Nothing available to book right now — check back soon.</span>
          </div>
        ) : (
          <div className="q-gallery">
            {packages.map((pkg: any) => {
              const services: string[] = (pkg.services || []).map((s: any) => s.name).filter(Boolean);
              return (
                <Link key={pkg.id} href={`/book/${params.slug}/${pkg.id}`} className="q-card q-card-interactive q-plain-link q-stack q-stack-sm">
                  <div>
                    <h3 className="q-section-title">{pkg.name}</h3>
                    {pkg.description && (
                      <p className="q-meta" style={{ marginTop: '4px' }}>{pkg.description}</p>
                    )}
                  </div>

                  {services.length > 0 && (
                    <div className="q-chip-row" style={{ marginTop: 'auto' }}>
                      {services.map((s) => (
                        <span key={s} className="q-chip q-meta-plain">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="q-row" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--q-color-ink-100)', justifyContent: 'space-between' }}>
                    <div>
                      <span className="q-doc-strong" style={{ fontSize: '1.1rem' }}>
                        {pkg.pricing?.base_price != null
                          ? formatMoney(pkg.pricing.base_price, pkg.pricing.currency || currencyCode)
                          : 'Custom quote'}
                      </span>
                      {pkg.price_unit && (
                        <span className="q-meta" style={{ marginLeft: '4px' }}>/{pkg.price_unit}</span>
                      )}
                    </div>
                    <span className="q-link">Book →</span>
                  </div>
                </Link>
              );
            })}

            {/* Custom Enquiry Card */}
            <Link href={`/book/${params.slug}`} className="q-card q-card-interactive q-plain-link q-stack q-stack-sm" style={{ border: '1px dashed var(--q-color-ink-300)', backgroundColor: 'transparent' }}>
              <div>
                <h3 className="q-section-title">Custom Quote</h3>
                <p className="q-meta" style={{ marginTop: '4px' }}>
                  Don&rsquo;t see what you need? Reach out with the details and we&rsquo;ll create a custom package just for you.
                </p>
              </div>
              <div className="q-row" style={{ marginTop: 'auto', paddingTop: '16px', justifyContent: 'flex-end' }}>
                <span className="q-link" style={{ color: 'var(--q-color-ink-600)' }}>Let&rsquo;s talk &rarr;</span>
              </div>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
