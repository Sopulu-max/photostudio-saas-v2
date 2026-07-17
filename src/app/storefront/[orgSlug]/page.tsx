import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { findOrCreateClient } from '@/lib/actions/persons';
import { createIntent } from '@/lib/actions/intents';

export default async function PublicStorefrontPage({ params }: { params: { orgSlug: string } }) {
  // 1. Fetch Org
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('slug', params.orgSlug)
    .single();

  if (!org) {
    return (
      <div className="q-page-header" style={{ padding: '48px', textAlign: 'center' }}>
        <h1 className="q-page-title">Studio Not Found</h1>
      </div>
    );
  }

  // 2. Fetch Active Service Templates for Dropdown
  const { data: serviceTemplates } = await supabaseAdmin
    .from('service_templates')
    .select('id, name, pricing')
    .eq('organization_id', org.id)
    .eq('status', 'active');

  // 3. Form Action
  async function submitInquiry(formData: FormData) {
    'use server';
    
    const email = formData.get('email') as string;
    const name = formData.get('name') as string;
    const serviceId = formData.get('serviceId') as string;
    const description = formData.get('description') as string;

    if (!email || !name) return;

    // Phase 1: Intake Person
    const person = await findOrCreateClient({
      organizationId: org!.id,
      email,
      displayName: name,
    });

    // Phase 2: Create Intent
    await createIntent({
      organizationId: org!.id,
      personId: person.id,
      source: 'storefront_form',
      description,
      serviceTemplateId: serviceId || undefined,
    });

    // Note: In a real app we'd redirect to a success page or show a toast.
    // For now, redirect to clear the form.
    redirect(`/storefront/${params.orgSlug}?success=true`);
  }

  // 4. Fetch layout (dummy or real)
  const { data: layoutData } = await supabaseAdmin
    .from('visual_layouts')
    .select('layout_data')
    .eq('organization_id', org.id)
    .eq('context', 'storefront')
    .eq('status', 'published')
    .single();

  const blocks = layoutData?.layout_data?.blocks || [
    { id: '1', type: 'heading', content: { text: `Welcome to ${org.name}` } },
    { id: '2', type: 'text', content: { text: 'Book your session below. We will respond with a formal proposal.' } },
    { id: '3', type: 'form', content: { formId: 'booking-intent-form' } },
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '48px 24px', fontFamily: 'var(--q-font-family)' }}>
      {blocks.map((block: any) => (
        <div key={block.id} style={{ marginBottom: '32px' }}>
          
          {block.type === 'heading' && (
            <h1 style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)', margin: '0 0 16px 0' }}>
              {block.content.text}
            </h1>
          )}
          
          {block.type === 'text' && (
            <p style={{ fontSize: '1.125rem', color: 'var(--q-color-ink-600)', lineHeight: 1.6 }}>
              {block.content.text}
            </p>
          )}
          
          {block.type === 'form' && (
            <div className="q-card" style={{ marginTop: '48px', background: 'var(--q-color-paper-elevated)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', fontSize: '1.25rem', color: 'var(--q-color-ink-900)' }}>
                Start a Booking Inquiry
              </h3>
              
              <form action={submitInquiry} style={{ display: 'grid', gap: '20px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Full Name</label>
                    <input name="name" type="text" required style={{ width: '100%', padding: '12px', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px', background: 'transparent' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Email Address</label>
                    <input name="email" type="email" required style={{ width: '100%', padding: '12px', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px', background: 'transparent' }} />
                  </div>
                </div>

                {serviceTemplates && serviceTemplates.length > 0 && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Service of Interest</label>
                    <select name="serviceId" style={{ width: '100%', padding: '12px', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px', background: 'transparent' }}>
                      <option value="">Select a service...</option>
                      {serviceTemplates.map((st: any) => (
                        <option key={st.id} value={st.id}>{st.name} (from ${st.pricing?.base_price || 0})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Project Details / Description</label>
                  <textarea name="description" required style={{ width: '100%', padding: '12px', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px', minHeight: '120px', background: 'transparent', resize: 'vertical' }} />
                </div>
                
                <button type="submit" className="q-btn q-btn-primary" style={{ justifySelf: 'start', padding: '12px 32px' }}>
                  Submit Inquiry
                </button>
              </form>
            </div>
          )}

        </div>
      ))}
    </div>
  );
}
