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
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)' }}>
      <header style={{ padding: 'clamp(48px, 8vw, 80px) 24px 32px', textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--q-color-ink-900)' }}>
          {org.name}
        </h1>
        <p style={{ margin: '12px auto 0', fontSize: '1.1rem', color: 'var(--q-color-ink-500)', maxWidth: '480px', lineHeight: 1.5 }}>
          Explore our offerings and book a session. We&rsquo;ll review your request and get back to you to confirm the details.
        </p>
      </header>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '0 24px 80px' }}>
        {packages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--q-color-ink-400)', backgroundColor: 'var(--q-color-paper)', borderRadius: '16px', border: '1px solid var(--q-color-ink-100)' }}>
            Nothing available to book right now — check back soon.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {packages.map((pkg: any) => {
              const services: string[] = (pkg.services || []).map((s: any) => s.name).filter(Boolean);
              return (
                <Link key={pkg.id} href={`/book/${params.slug}/${pkg.id}`} className="q-card q-card-interactive q-plain-link" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', borderRadius: '16px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 600, color: 'var(--q-color-ink-900)', letterSpacing: '-0.01em' }}>{pkg.name}</h3>
                    {pkg.description && (
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--q-color-ink-500)', lineHeight: 1.5 }}>{pkg.description}</p>
                    )}
                  </div>

                  {services.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {services.map((s) => (
                        <span key={s} style={{ fontSize: '0.75rem', fontWeight: 500, padding: '3px 10px', background: 'var(--q-color-ink-100)', borderRadius: '20px', color: 'var(--q-color-ink-600)' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--q-color-ink-100)' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--q-color-ink-900)', fontVariantNumeric: 'tabular-nums' }}>
                        {pkg.pricing?.base_price != null
                          ? formatMoney(pkg.pricing.base_price, pkg.pricing.currency || currencyCode)
                          : 'Custom quote'}
                      </span>
                      {pkg.price_unit && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-400)', marginLeft: '4px' }}>/{pkg.price_unit}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--q-color-accent)' }}>Book →</span>
                  </div>
                </Link>
              );
            })}

            {/* Custom Enquiry Card */}
            <Link href={`/book/${params.slug}/custom`} className="q-card q-card-interactive q-plain-link" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', borderRadius: '16px', border: '1px dashed var(--q-color-ink-300)', backgroundColor: 'transparent' }}>
              <div>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 600, color: 'var(--q-color-ink-900)', letterSpacing: '-0.01em' }}>Custom Quote</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--q-color-ink-500)', lineHeight: 1.5 }}>
                  Don&rsquo;t see what you need? Reach out with the details and we&rsquo;ll create a custom package just for you.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 'auto', paddingTop: '16px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--q-color-ink-500)' }}>Let&rsquo;s talk &rarr;</span>
              </div>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
