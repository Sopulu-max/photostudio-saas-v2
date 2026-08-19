import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getStudioBySlug } from '@/kernel/organizations';
import { listPackagesPublicWithDimensions } from '@/modules/packages/interface';
import StorefrontExplorer from './StorefrontExplorer';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;

  const org = await getStudioBySlug(params.slug);
  if (!org) notFound();

  const packages = await listPackagesPublicWithDimensions(org.id);
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
        <StorefrontExplorer 
          packages={packages} 
          slug={params.slug} 
          currencyCode={currencyCode} 
        />
      </main>
    </div>
  );
}
