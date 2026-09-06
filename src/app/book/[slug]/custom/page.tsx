import { notFound } from 'next/navigation';
import { getStudioBySlug } from '@/kernel/organizations';
import { getPublicIntakeDimensions, premisesValueIdsFor } from '@/modules/services/interface';
import { listPackagesPublicWithDimensions } from '@/modules/packages/interface';
import { BookingForm } from '../[packageId]/BookingForm';

export const dynamic = 'force-dynamic';

export default async function CustomBookingPage(props: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await props.params;

  /*
   * WHAT THEY ALREADY SAID, ON THE WAY IN.
   *
   * A client narrows the catalogue by the studio's own dimension values, finds
   * nothing that fits, and asks for a quote. Those values are answers to the
   * very questions this form opens with — so they arrive with it rather than
   * being asked a second time.
   *
   * The old storefront built exactly this query string and this page never
   * read it, so every answer a client gave on the way here was appended to a
   * URL and thrown away. Read here, checked against the studio's real
   * vocabulary in the form, and ignored if it names anything else: this is a
   * query string, and a query string is whatever the visitor typed.
   */
  const searchParams = await props.searchParams;
  const raw = searchParams.dimension_value_id;
  const carriedValueIds = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .filter((v) => typeof v === 'string' && v.length > 0);

  const org = await getStudioBySlug(params.slug);
  if (!org) notFound();

  const [dimensionConfig, packages, premisesValues] = await Promise.all([
    getPublicIntakeDimensions(org.id),
    listPackagesPublicWithDimensions(org.id),
    // So the date field never tells somebody booking a wedding at their own
    // venue that the studio's office is shut that day.
    premisesValueIdsFor(org.id),
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
            Request a booking
          </h1>
          <p style={{ margin: '0 0 28px', color: 'var(--q-color-ink-500)', fontSize: '1rem', lineHeight: 1.6 }}>
            Describe what you need. The studio matches it to a package, or puts one together.
          </p>

          <BookingForm
            orgId={org.id}
            packageId="custom"
            packageName="Custom booking"
            formSchema={[]}
            currencyCode={org.currency || 'USD'}
            dimensionConfig={dimensionConfig}
            availablePackages={packages}
            premisesValueIds={premisesValues}
            studioSlug={params.slug}
            carriedValueIds={carriedValueIds}
            triggerLabel="Start booking"
          />
        </div>

      </div>
    </div>
  );
}
