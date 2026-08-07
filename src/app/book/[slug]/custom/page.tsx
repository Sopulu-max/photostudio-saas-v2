import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BookingForm } from '../[packageId]/BookingForm';

export const dynamic = 'force-dynamic';

export default async function CustomEnquiryPage(props: {
  params: Promise<{ slug: string }>
}) {
  const params = await props.params;

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', params.slug)
    .single();
  if (!org) notFound();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', padding: 'clamp(32px, 6vw, 80px) 24px' }}>
      <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>

        <div style={{ marginBottom: '40px' }}>
          <a href={`/book/${params.slug}`} className="q-plain-link" style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--q-color-ink-500)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>&larr;</span> {org.name}
          </a>
        </div>

        <div className="q-card" style={{ marginBottom: '32px', padding: '32px', borderRadius: '16px' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: 'var(--q-color-ink-900)', letterSpacing: '-0.02em' }}>
            Custom Enquiry
          </h1>
          <p style={{ margin: '0 0 24px', color: 'var(--q-color-ink-500)', fontSize: '1rem', lineHeight: 1.6 }}>
            Don&rsquo;t see exactly what you&rsquo;re looking for? Tell us about your project, idea, or event, and we&rsquo;ll put together a custom quote for you.
          </p>

          <BookingForm
            orgId={org.id}
            packageId="custom"
            packageName="Custom Enquiry"
            formSchema={[]}
            triggerLabel="Start Custom Request"
          />
        </div>
      </div>
    </div>
  );
}
