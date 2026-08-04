import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { listServicesPublic, listCategoriesPublic } from '@/modules/services/interface';
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

  const [services, categories] = await Promise.all([
    listServicesPublic(org.id),
    listCategoriesPublic(org.id),
  ]);
  const currencyCode = org.currency || 'USD';

  const ServiceCard = ({ svc }: { svc: any }) => (
    <Link href={`/book/${params.slug}/${svc.id}`} className="q-card q-card-interactive q-plain-link q-stack">
      <h3 className="q-section-title" style={{ marginBottom: '4px' }}>{svc.name}</h3>
      {svc.description && <p className="q-meta" style={{ margin: 0 }}>{svc.description}</p>}
      <div className="q-row q-row-between" style={{ marginTop: 'auto', paddingTop: '12px' }}>
        <span className="q-strong q-num">
          {formatMoney(svc.pricing?.base_price, svc.pricing?.currency || currencyCode)}
          {svc.price_unit ? <span className="q-meta-sm"> /{svc.price_unit}</span> : null}
        </span>
        <span className="q-btn q-btn-secondary q-btn-sm">Request</span>
      </div>
    </Link>
  );

  const categorized = categories
    .map((cat: any) => ({ cat, items: services.filter((s: any) => s.category_id === cat.id) }))
    .filter((g: any) => g.items.length > 0);
  const uncategorized = services.filter((s: any) => !s.category_id);

  return (
    <div className="q-public">
      <header className="q-public-header">
        <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 620, letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)' }}>
          {org.name}
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--q-color-ink-500)' }}>What we offer — pick one to get started.</p>
      </header>

      <main className="q-public-main q-public-wide">
        {services.length === 0 ? (
          <p className="q-center-text q-muted">Nothing available to book right now — check back soon.</p>
        ) : (
          <div className="q-stack q-stack-lg">
            {categorized.map(({ cat, items }: any) => (
              <section key={cat.id}>
                <h2 className="q-section-title">{cat.name}</h2>
                <div className="q-grid-cards">
                  {items.map((svc: any) => <ServiceCard key={svc.id} svc={svc} />)}
                </div>
              </section>
            ))}
            {uncategorized.length > 0 && (
              <section>
                {categorized.length > 0 && <h2 className="q-section-title">More</h2>}
                <div className="q-grid-cards">
                  {uncategorized.map((svc: any) => <ServiceCard key={svc.id} svc={svc} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
