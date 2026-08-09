import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatMoney } from '@/kernel/currency';
import { BookingForm } from './BookingForm';

export const dynamic = 'force-dynamic';

export default async function BookingPage(props: {
  params: Promise<{ slug: string; packageId: string }>
}) {
  const params = await props.params;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, currency')
    .eq('slug', params.slug)
    .single();
  if (!org) notFound();

  const { data: pkg } = await supabaseAdmin
    .from('packages')
    .select(`
      id, name, description, pricing, pricing_variant, duration_minutes, form_schema,
      package_services(service:services(name)),
      package_deliverables(output_type:output_types(name))
    `)
    .eq('organization_id', org.id)
    .eq('id', params.packageId)
    .single();
  if (!pkg) notFound();

  const currencyCode = (org as any).currency || 'USD';
  const services: string[] = ((pkg as any).package_services || []).map((ps: any) => ps.service?.name).filter(Boolean);
  const deliverables: string[] = ((pkg as any).package_deliverables || []).map((pd: any) => pd.output_type?.name).filter(Boolean);
  const pricing: any = (pkg as any).pricing || {};
  const variant: any = (pkg as any).pricing_variant || null;
  const durationMin: number | null = (pkg as any).duration_minutes ?? null;

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
            {(pkg as any).name}
          </h1>
          {(pkg as any).description && (
            <p style={{ margin: '0 0 24px', color: 'var(--q-color-ink-500)', fontSize: '1rem', lineHeight: 1.6 }}>
              {(pkg as any).description}
            </p>
          )}

          <div style={{ marginBottom: '32px' }}>
            {/* The form (which now renders a button that opens a wizard) */}
            <BookingForm
              orgId={org.id}
              packageId={(pkg as any).id}
              packageName={(pkg as any).name}
              formSchema={(pkg as any).form_schema || []}
              variant={variant}
              currencyCode={currencyCode}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', padding: '24px 0', borderTop: '1px solid var(--q-color-ink-100)' }}>
            {pricing.base_price != null && !variant && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--q-color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Price</div>
                <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--q-color-ink-900)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(pricing.base_price, pricing.currency || currencyCode)}
                </div>
              </div>
            )}
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
