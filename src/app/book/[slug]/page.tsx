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

  const PackageCard = ({ pkg }: { pkg: any }) => (
    <Link href={`/book/${params.slug}/${pkg.id}`} className="q-card q-card-interactive q-plain-link q-stack">
      <h3 className="q-section-title" style={{ marginBottom: '4px' }}>{pkg.name}</h3>
      {pkg.description && <p className="q-meta" style={{ margin: 0 }}>{pkg.description}</p>}
      <div className="q-row q-row-between" style={{ marginTop: 'auto', paddingTop: '12px' }}>
        <span className="q-strong q-num">
          {formatMoney(pkg.pricing?.base_price, pkg.pricing?.currency || currencyCode)}
          {pkg.price_unit ? <span className="q-meta-sm"> /{pkg.price_unit}</span> : null}
        </span>
        <span className="q-btn q-btn-secondary q-btn-sm">Request</span>
      </div>
    </Link>
  );

  return (
    <div className="q-public">
      <header className="q-public-header">
        <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 620, letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)' }}>
          {org.name}
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--q-color-ink-500)' }}>What we offer — pick one to get started.</p>
      </header>

      <main className="q-public-main q-public-wide">
        {packages.length === 0 ? (
          <p className="q-center-text q-muted">Nothing available to book right now — check back soon.</p>
        ) : (
          <div className="q-grid-cards">
            {packages.map((pkg: any) => <PackageCard key={pkg.id} pkg={pkg} />)}
          </div>
        )}
      </main>
    </div>
  );
}
