import { notFound } from 'next/navigation';
import { getStudioBySlug } from '@/kernel/organizations';
import { getPublicIntakeDimensions } from '@/modules/services/interface';
import { listPackagesPublicWithDimensions } from '@/modules/packages/interface';
import { BookingForm } from '../[packageId]/BookingForm';

export const dynamic = 'force-dynamic';

export default async function CustomBookingPage(props: {
  params: Promise<{ slug: string }>
}) {
  const params = await props.params;

  const org = await getStudioBySlug(params.slug);
  if (!org) notFound();

  const [dimensionConfig, packages] = await Promise.all([
    getPublicIntakeDimensions(org.id),
    listPackagesPublicWithDimensions(org.id),
  ]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', padding: 'clamp(32px, 6vw, 80px) 24px' }}>
      <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>

        <div style={{ marginBottom: '40px' }}>
          <a href={`/book/${params.slug}`} className="q-plain-link" style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--q-color-ink-500)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>&larr;</span> {org.name}
          </a>
        </div>

        <div className="q-card" style={{ padding: '32px', borderRadius: '16px' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: 'var(--q-color-ink-900)', letterSpacing: '-0.02em' }}>
            Book something
          </h1>
          <p style={{ margin: '0 0 28px', color: 'var(--q-color-ink-500)', fontSize: '1rem', lineHeight: 1.6 }}>
            Tell us what you&rsquo;re looking for and we&rsquo;ll match you to the right package — or put one together if we need to.
          </p>

          <BookingForm
            orgId={org.id}
            packageId="custom"
            packageName="Custom booking"
            formSchema={[]}
            currencyCode={org.currency || 'USD'}
            dimensionConfig={dimensionConfig}
            availablePackages={packages}
            triggerLabel="Start booking"
          />
        </div>

      </div>
    </div>
  );
}
