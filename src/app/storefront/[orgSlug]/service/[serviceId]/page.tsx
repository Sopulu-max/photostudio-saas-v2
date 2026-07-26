import { supabaseAdmin } from '@/lib/supabase/admin';
import { Renderer, VisualNode } from '@/components/VisualEngine/Renderer';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PublicServicePage(props: {
  params: Promise<{ orgSlug: string; serviceId: string }>;
}) {
  const { orgSlug, serviceId } = await props.params;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .single();
  if (!org) notFound();

  const { data: service } = await supabaseAdmin
    .from('service_templates')
    .select('*')
    .eq('id', serviceId)
    .eq('organization_id', org.id)
    .single();
  if (!service) notFound();

  const { data: layout } = await supabaseAdmin
    .from('visual_layouts')
    .select('layout_data')
    .eq('organization_id', org.id)
    .eq('context', 'service')
    .eq('subject_id', serviceId)
    .eq('status', 'published')
    .maybeSingle();

  const root: VisualNode | undefined = (layout?.layout_data as any)?.root;
  const bookUrl = `/book/${orgSlug}/${serviceId}`;
  const price = service.pricing?.base_price ?? 0;
  const currency = service.pricing?.currency || 'USD';
  const heroImage = Array.isArray(service.media) ? service.media[0]?.url : undefined;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--q-color-paper-subtle)', paddingBottom: '80px' }}>
      {root ? (
        <div style={{ maxWidth: '920px', margin: '0 auto', background: 'var(--q-color-paper-base)', minHeight: '60vh' }}>
          <Renderer node={root} dataContext={{ service }} />
        </div>
      ) : (
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: 'clamp(32px, 6vw, 72px) 24px' }}>
          {heroImage && (
            <img src={heroImage} alt={service.name} style={{ width: '100%', borderRadius: '16px', aspectRatio: '16 / 9', objectFit: 'cover', marginBottom: '32px' }} />
          )}
          <div style={{ fontFamily: 'var(--q-font-mono)', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--q-color-ink-500)', marginBottom: '12px' }}>
            {org.name}
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--q-color-ink-900)', margin: '0 0 14px' }}>
            {service.name}
          </h1>
          {service.description && (
            <p style={{ fontSize: '1.1rem', lineHeight: 1.6, color: 'var(--q-color-ink-600)', margin: 0 }}>{service.description}</p>
          )}
          <div style={{ fontFamily: 'var(--q-font-mono)', fontWeight: 600, fontSize: '1.35rem', color: 'var(--q-color-ink-900)', marginTop: '24px' }}>
            {currency} {price}
          </div>
        </div>
      )}

      {/* Always present, so "share a link clients can book from" is real. */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, borderTop: '1px solid var(--q-color-ink-100)', background: 'color-mix(in srgb, var(--q-color-paper-base) 86%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: '14px 24px', display: 'flex', justifyContent: 'center', zIndex: 20 }}>
        <Link href={bookUrl} className="q-btn q-btn-primary" style={{ padding: '13px 32px', fontSize: '1rem' }}>
          Book {service.name} — {currency} {price}
        </Link>
      </div>
    </div>
  );
}
