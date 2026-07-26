'use server';

import { supabaseAdmin } from '../supabase/admin';
import { getAuthOrgId } from '../supabase/getOrgId';
import { revalidatePath } from 'next/cache';
import type { VisualNode } from '@/components/VisualEngine/Renderer';

/**
 * Persist a layout's block tree.
 *
 * This runs on the server: the org is derived from the session and the update
 * is scoped to it (Multi-Tenant Mandate), so the service-role client never
 * touches the browser. Replaces the previous client-side supabaseAdmin write.
 */
export async function saveLayout(layoutId: string, root: VisualNode) {
  const { orgId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('visual_layouts')
    .update({ layout_data: { root } })
    .eq('id', layoutId)
    .eq('organization_id', orgId);

  if (error) {
    console.error('Failed to save layout:', error);
    throw new Error('Failed to save layout');
  }

  revalidatePath(`/visual-layouts/${layoutId}`);
}

/**
 * Save the layout AND mark it published, so the public page renders it.
 */
export async function publishLayout(layoutId: string, root: VisualNode) {
  const { orgId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('visual_layouts')
    .update({ layout_data: { root }, status: 'published', published_at: new Date().toISOString() })
    .eq('id', layoutId)
    .eq('organization_id', orgId);

  if (error) {
    console.error('Failed to publish layout:', error);
    throw new Error('Failed to publish layout');
  }

  revalidatePath(`/visual-layouts/${layoutId}`);
}

/**
 * Find (or create) the page layout for a given service, and return its id.
 * A service's page is a visual_layout with context 'service' pointing at the
 * service via subject_id — so the builder can open on it bound to real data.
 */
export async function getOrCreateServiceLayout(serviceId: string): Promise<string> {
  const { orgId } = await getAuthOrgId();

  const { data: existing } = await supabaseAdmin
    .from('visual_layouts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('context', 'service')
    .eq('subject_id', serviceId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from('visual_layouts')
    .insert({
      organization_id: orgId,
      context: 'service',
      subject_type: 'service',
      subject_id: serviceId,
      name: 'Service page',
      layout_data: { root: { id: 'root', type: 'Container', props: { style: { minHeight: '100%' } }, children: [] } },
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !created) {
    console.error('Failed to create service layout:', error);
    throw new Error('Failed to open the page designer');
  }

  return created.id;
}

/**
 * Find (or create) the public storefront layout for the organization.
 */
export async function getOrCreateStorefrontLayout(): Promise<string> {
  const { orgId } = await getAuthOrgId();

  const { data: existing } = await supabaseAdmin
    .from('visual_layouts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('context', 'storefront')
    .is('subject_type', null)
    .maybeSingle();

  if (existing) return existing.id;

  // The default storefront tree
  const defaultRoot: VisualNode = {
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
            props: { level: 1, text: 'Welcome to our Studio', style: { fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)', margin: '0 0 16px 0' } }
          },
          {
            id: 'subtitle',
            type: 'Text',
            props: { text: 'Book your session below. We will respond with a formal proposal.', style: { display: 'block', fontSize: '1.125rem', color: 'var(--q-color-ink-600)', lineHeight: 1.6 } }
          }
        ]
      },
      {
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

  const { data: created, error } = await supabaseAdmin
    .from('visual_layouts')
    .insert({
      organization_id: orgId,
      context: 'storefront',
      subject_type: null,
      subject_id: null,
      name: 'Main Storefront',
      layout_data: { root: defaultRoot },
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !created) {
    console.error('Failed to create storefront layout:', error);
    throw new Error('Failed to open the storefront designer');
  }

  return created.id;
}

