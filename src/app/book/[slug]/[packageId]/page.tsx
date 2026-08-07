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
      package_deliverables(deliverable:deliverables(name))
    `)
    .eq('organization_id', org.id)
    .eq('id', params.packageId)
    .single();
  if (!pkg) notFound();

  const currencyCode = (org as any).currency || 'USD';
  const services: string[] = ((pkg as any).package_services || []).map((ps: any) => ps.service?.name).filter(Boolean);
  const deliverables: string[] = ((pkg as any).package_deliverables || []).map((pd: any) => pd.deliverable?.name).filter(Boolean);
  const pricing: any = (pkg as any).pricing || {};
  const variant: any = (pkg as any).pricing_variant || null;
  const durationMin: number | null = (pkg as any).duration_minutes ?? null;

  const durationLabel = durationMin
    ? durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ''}`
      : `${durationMin}m`
    : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-ink-50)', padding: 'clamp(32px, 6vw, 80px) 24px' }}>
      <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>

        {/* Studio + back */}
        <div style={{ marginBottom: '32px' }}>
          <a href={`/book/${params.slug}`} style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-400)', textDecoration: 'none' }}>
            ← {org.name}
          </a>
        </div>

        {/* Package summary — what they're requesting */}
        <div className="q-card" style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.2rem, 3vw, 1.5rem)', fontWeight: 700, color: 'var(--q-color-ink-900)', letterSpacing: '-0.01em' }}>
            {(pkg as any).name}
          </h1>
          {(pkg as any).description && (
            <p style={{ margin: '0 0 16px', color: 'var(--q-color-ink-500)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {(pkg as any).description}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', padding: '16px 0', borderTop: '1px solid var(--q-color-ink-100)' }}>
            {pricing.base_price != null && !variant && (
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--q-color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Price</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--q-color-ink-900)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(pricing.base_price, pricing.currency || currencyCode)}
                </div>
              </div>
            )}
            {durationLabel && (
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--q-color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Duration</div>
                <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--q-color-ink-900)' }}>{durationLabel}</div>
              </div>
            )}
          </div>

          {services.length > 0 && (
            <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '12px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--q-color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                What&rsquo;s included
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {services.map((s) => (
                  <span key={s} style={{ fontSize: '0.8rem', padding: '3px 10px', background: 'var(--q-color-ink-100)', borderRadius: '20px', color: 'var(--q-color-ink-600)' }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {deliverables.length > 0 && (
            <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '12px', marginTop: services.length > 0 ? '12px' : 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--q-color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                You&rsquo;ll receive
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {deliverables.map((d) => (
                  <span key={d} style={{ fontSize: '0.8rem', padding: '3px 10px', background: 'color-mix(in srgb, var(--q-color-accent) 10%, transparent)', borderRadius: '20px', color: 'var(--q-color-accent)' }}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* The form */}
        <BookingForm
          orgId={org.id}
          packageId={(pkg as any).id}
          packageName={(pkg as any).name}
          formSchema={(pkg as any).form_schema || []}
          variant={variant}
          currencyCode={currencyCode}
        />
      </div>
    </div>
  );
}
