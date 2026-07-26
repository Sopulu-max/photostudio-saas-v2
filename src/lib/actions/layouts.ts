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
