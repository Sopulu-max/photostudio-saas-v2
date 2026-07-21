import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BookingForm } from './BookingForm';

export default async function BookingPage({
  params
}: {
  params: { slug: string; serviceId: string }
}) {
  // 1. Resolve Organization from slug
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', params.slug)
    .single();

  if (!org) {
    notFound();
  }

  // 2. Fetch the Service Template
  const { data: service } = await supabaseAdmin
    .from('service_templates')
    .select('id, name, form_schema')
    .eq('organization_id', org.id)
    .eq('id', params.serviceId)
    .single();

  if (!service) {
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
            Booking Request: <strong>{service.name}</strong>
          </p>
        </header>

        <BookingForm 
          orgId={org.id} 
          serviceId={service.id} 
          serviceName={service.name}
          formSchema={service.form_schema || []} 
        />
      </div>
    </div>
  );
}
