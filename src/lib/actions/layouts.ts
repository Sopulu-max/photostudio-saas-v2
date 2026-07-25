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
