import { notFound } from 'next/navigation';
import { formatMoney } from '@/kernel/currency';
import { getStudioBySlug } from '@/kernel/organizations';
import { getPackagePublic, getOpenVariablesForPackagePublic } from '@/modules/packages/interface';
import { BookingForm } from './BookingForm';

export const dynamic = 'force-dynamic';

export default async function BookingPage(props: {
  params: Promise<{ slug: string; packageId: string }>
}) {
  const params = await props.params;

  // The public path carries a slug, not a session, so the org is resolved from
  // it and then passed explicitly to everything below.
  const org = await getStudioBySlug(params.slug);
  if (!org) notFound();

  const pkg = await getPackagePublic(org.id, params.packageId);
  if (!pkg) notFound();

  // What this package deliberately left open becomes the questions asked below.
  const openVariables = await getOpenVariablesForPackagePublic(org.id, params.packageId);

  const currencyCode = org.currency;
  const services = pkg.serviceNames;
  const deliverables = pkg.deliverableNames;
  const durationMin: number | null = pkg.durationMinutes;

  const durationLabel = durationMin
    ? durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ''}`
      : `${durationMin}m`
    : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', padding: 'clamp(32px, 6vw, 80px) 24px' }}>
      <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>

        {/* Studio + back */}
        <div style={{ marginBottom: '40px' }}>
          <a href={`/storefront/${params.slug}`} className="q-plain-link" style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--q-color-ink-500)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>&larr;</span> {org.name}
          </a>
        </div>

        {/* Package summary — what they're requesting */}
        <div className="q-card" style={{ marginBottom: '32px', padding: '32px', borderRadius: '16px' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: 'var(--q-color-ink-900)', letterSpacing: '-0.02em' }}>
            {pkg.name}
          </h1>
          {pkg.description && (
            <p style={{ margin: '0 0 24px', color: 'var(--q-color-ink-500)', fontSize: '1rem', lineHeight: 1.6 }}>
              {pkg.description}
            </p>
          )}

          <div style={{ marginBottom: '32px' }}>
            {/* The form (which now renders a button that opens a wizard) */}
            <BookingForm
              orgId={org.id}
              packageId={pkg.id}
              packageName={pkg.name}
              formSchema={pkg.formSchema}
              openVariables={openVariables}
                            currencyCode={currencyCode}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', padding: '24px 0', borderTop: '1px solid var(--q-color-ink-100)' }}>

            {durationLabel && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--q-color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Duration</div>
                <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--q-color-ink-900)' }}>{durationLabel}</div>
              </div>
            )}
          </div>

          {services.length > 0 && (
            <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '20px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--q-color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                What&rsquo;s included
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {services.map((s) => (
                  <span key={s} style={{ fontSize: '0.85rem', fontWeight: 500, padding: '4px 12px', background: 'var(--q-color-ink-100)', borderRadius: '24px', color: 'var(--q-color-ink-700)' }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {deliverables.length > 0 && (
            <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '20px', marginTop: services.length > 0 ? '20px' : 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--q-color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                You&rsquo;ll receive
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {deliverables.map((d) => (
                  <span key={d} style={{ fontSize: '0.85rem', fontWeight: 500, padding: '4px 12px', background: 'color-mix(in srgb, var(--q-color-accent) 8%, transparent)', borderRadius: '24px', color: 'var(--q-color-accent-hi)' }}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
