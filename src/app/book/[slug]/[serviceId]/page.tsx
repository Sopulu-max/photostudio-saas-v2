import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BookingForm } from './BookingForm';

export default async function BookingPage(props: {
  params: Promise<{ slug: string; serviceId: string }>
}) {
  const params = await props.params;

  // 1. Resolve Organization from slug
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, currency')
    .eq('slug', params.slug)
    .single();

  if (!org) {
    notFound();
  }

  // 2. Fetch the Package being requested
  const { data: pkg } = await supabaseAdmin
    .from('packages')
    .select('id, name, form_schema, pricing_variant')
    .eq('organization_id', org.id)
    .eq('id', params.serviceId)
    .single();

  if (!pkg) {
    notFound();
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-ink-50)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 24px' }}>
      <div style={{ width: '100%', maxWidth: '600px' }}>
        <header style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--q-color-ink-900)', margin: '0 0 8px 0' }}>
            {org.name}
          </h1>
          <p style={{ fontSize: '1.125rem', color: 'var(--q-color-ink-500)', margin: 0 }}>
            Booking Request: <strong>{pkg.name}</strong>
          </p>
        </header>

        <BookingForm
          orgId={org.id}
          serviceId={pkg.id}
          serviceName={pkg.name}
          formSchema={pkg.form_schema || []}
          variant={pkg.pricing_variant as any}
          currencyCode={(org as any).currency || 'USD'}
        />
      </div>
    </div>
  );
}
