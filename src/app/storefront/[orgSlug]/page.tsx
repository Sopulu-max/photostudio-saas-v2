import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { findOrCreateClient } from '@/lib/actions/persons';
import { createIntent } from '@/lib/actions/intents';
import { Renderer, VisualNode } from '@/components/VisualEngine/Renderer';

export default async function PublicStorefrontPage({ params, searchParams }: { params: { orgSlug: string }, searchParams: { success?: string } }) {
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

    const person = await findOrCreateClient({
      organizationId: org!.id,
      email,
      displayName: name,
    });

    await createIntent({
      organizationId: org!.id,
      personId: person.id,
      source: 'storefront_form',
      description,
      serviceTemplateId: serviceId || undefined,
    });

    redirect(`/storefront/${params.orgSlug}?success=true`);
  }

  // 4. Fetch layout
  const { data: layoutData } = await supabaseAdmin
    .from('visual_layouts')
    .select('layout_data')
    .eq('organization_id', org.id)
    .eq('context', 'storefront')
    .eq('status', 'published')
    .single();

  // 5. Construct Default Fallback Tree if layoutData is empty
  const defaultLayout: VisualNode = layoutData?.layout_data?.root || {
    id: 'root',
    type: 'Container',
    props: { style: { maxWidth: '800px', margin: '0 auto', padding: '48px 24px', fontFamily: 'var(--q-font-family)' } },
    children: [
      {
        id: 'header-container',
        type: 'Container',
        props: { style: { marginBottom: '32px' } },
        children: [
          {
            id: 'h1',
            type: 'Heading',
            props: { level: 1, text: `Welcome to ${org.name}`, style: { fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)', margin: '0 0 16px 0' } }
          },
          {
            id: 'subtitle',
            type: 'Text',
            props: { text: 'Book your session below. We will respond with a formal proposal.', style: { display: 'block', fontSize: '1.125rem', color: 'var(--q-color-ink-600)', lineHeight: 1.6 } }
          }
        ]
      },
      searchParams?.success ? {
        id: 'success-msg',
        type: 'Container',
        props: { style: { padding: '24px', background: '#D1FAE5', color: '#065F46', borderRadius: '8px', border: '1px solid #34D399', textAlign: 'center' } },
        children: [
          { id: 'success-txt', type: 'Heading', props: { level: 3, text: 'Inquiry Submitted Successfully!', style: { margin: '0 0 8px 0' } } },
          { id: 'success-subtxt', type: 'Text', props: { text: 'We will review your details and send a formal proposal shortly.' } }
        ]
      } : {
        id: 'form-card',
        type: 'Container',
        props: { className: 'q-card', style: { marginTop: '48px', background: 'var(--q-color-paper-elevated)', padding: '32px' } },
        children: [
          {
            id: 'form-title',
            type: 'Heading',
            props: { level: 3, text: 'Start a Booking Inquiry', style: { marginTop: 0, marginBottom: '24px', fontSize: '1.25rem', color: 'var(--q-color-ink-900)' } }
          },
          {
            id: 'inquiry-form',
            type: 'Form',
            props: { style: { display: 'grid', gap: '20px' } },
            children: [
              {
                id: 'row-1',
                type: 'Grid',
                props: { style: { gridTemplateColumns: '1fr 1fr', gap: '16px' } },
                children: [
                  {
                    id: 'name-col',
                    type: 'Container',
                    props: {},
                    children: [
                      { id: 'name-label', type: 'Text', props: { text: 'Full Name', style: { display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' } } },
                      { id: 'name-input', type: 'Input', props: { name: 'name', type: 'text', required: true, style: { width: '100%', padding: '12px', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px', background: 'transparent' } } }
                    ]
                  },
                  {
                    id: 'email-col',
                    type: 'Container',
                    props: {},
                    children: [
                      { id: 'email-label', type: 'Text', props: { text: 'Email Address', style: { display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' } } },
                      { id: 'email-input', type: 'Input', props: { name: 'email', type: 'email', required: true, style: { width: '100%', padding: '12px', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px', background: 'transparent' } } }
                    ]
                  }
                ]
              },
              {
                id: 'service-col',
                type: 'Container',
                props: {},
                children: [
                  { id: 'service-label', type: 'Text', props: { text: 'Service of Interest', style: { display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' } } },
                  { 
                    id: 'service-select', 
                    type: 'Select', 
                    props: { name: 'serviceId', style: { width: '100%', padding: '12px', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px', background: 'transparent' } },
                    children: [
                      { id: 'opt-def', type: 'Option', props: { value: '', text: 'Select a service...' } },
                      ...(serviceTemplates || []).map((st: any) => ({
                        id: `opt-${st.id}`,
                        type: 'Option',
                        props: { value: st.id, text: `${st.name} (from $${st.pricing?.base_price || 0})` }
                      }))
                    ]
                  }
                ]
              },
              {
                id: 'desc-col',
                type: 'Container',
                props: {},
                children: [
                  { id: 'desc-label', type: 'Text', props: { text: 'Project Details / Description', style: { display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' } } },
                  { id: 'desc-textarea', type: 'TextArea', props: { name: 'description', required: true, style: { width: '100%', padding: '12px', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px', minHeight: '120px', background: 'transparent', resize: 'vertical' } } }
                ]
              },
              {
                id: 'submit-btn',
                type: 'Button',
                props: { type: 'submit', className: 'q-btn q-btn-primary', style: { justifySelf: 'start', padding: '12px 32px' }, text: 'Submit Inquiry' }
              }
            ]
          }
        ]
      }
    ]
  };

  return (
    <Renderer node={defaultLayout} formAction={submitInquiry} />
  );
}
