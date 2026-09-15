'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { revalidatePath } from 'next/cache';
import { dbError } from '@/kernel/errors';
import type { PackageExtra } from '@/lib/types/engine';

/**
 * Returns all extras specifically offered by a package.
 */
export async function listPackageExtras(packageId: string): Promise<PackageExtra[]> {
  const orgId = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('package_extras')
    .select('*')
    .eq('organization_id', orgId)
    .eq('package_id', packageId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw dbError(error);
  return (data || []) as PackageExtra[];
}

/**
 * Appends a new extra to a package's offering.
 */
export async function createPackageExtra(packageId: string, extra: Partial<PackageExtra>) {
  const orgId = await getAuthOrgId();
  
  // ensure required fields exist
  if (!extra.name || !extra.price || !extra.target_type) {
    throw new Error('Name, price, and target_type are required to create an extra.');
  }

  const { data, error } = await supabaseAdmin
    .from('package_extras')
    .insert({
      organization_id: orgId,
      package_id: packageId,
      name: extra.name,
      description: extra.description || null,
      price: extra.price,
      target_type: extra.target_type,
      target_deliverable_id: extra.target_deliverable_id || null,
      target_deliverable_quantity: extra.target_deliverable_quantity || null,
      target_service_id: extra.target_service_id || null,
      target_package_id: extra.target_package_id || null,
      position: extra.position || 0,
      status: extra.status || 'active',
    })
    .select()
    .single();

  if (error) throw dbError(error);
  revalidatePath('/packages/' + packageId);
  return data as PackageExtra;
}

/**
 * Updates an existing package extra.
 */
export async function updatePackageExtra(extraId: string, updates: Partial<PackageExtra>) {
  const orgId = await getAuthOrgId();
  
  const { data, error } = await supabaseAdmin
    .from('package_extras')
    .update({
      ...updates,
      // prevent touching critical structural boundaries
      id: undefined,
      organization_id: undefined,
      package_id: undefined,
      created_at: undefined,
      updated_at: undefined,
    })
    .eq('id', extraId)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) throw dbError(error);
  revalidatePath('/packages/' + data.package_id);
  return data as PackageExtra;
}

/**
 * Removes an extra from a package.
 */
export async function deletePackageExtra(extraId: string) {
  const orgId = await getAuthOrgId();
  
  // Need to get the package_id first to revalidate correctly
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('package_extras')
    .select('package_id')
    .eq('id', extraId)
    .eq('organization_id', orgId)
    .single();
    
  if (fetchErr) return;

  const { error } = await supabaseAdmin
    .from('package_extras')
    .delete()
    .eq('id', extraId)
    .eq('organization_id', orgId);

  if (error) throw dbError(error);
  
  if (existing?.package_id) {
    revalidatePath('/packages/' + existing.package_id);
  }
}

