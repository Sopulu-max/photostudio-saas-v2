'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { FacingConfig } from '@/lib/domains/presentation/types';

/**
 * Retrieves the surface configuration (FacingConfig) for a given organization.
 * Falls back to an empty configuration if none is found.
 */
export async function getFacingConfig(organizationId: string): Promise<FacingConfig> {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from('surface_configurations')
    .select('facing_config')
    .eq('organization_id', organizationId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is the code for 'No rows found', which is expected if not set yet.
    console.error('Failed to fetch surface configuration', error);
    throw new Error('Failed to fetch surface configuration');
  }

  if (data?.facing_config) {
    return data.facing_config as unknown as FacingConfig;
  }

  return {};
}

/**
 * Saves the surface configuration (FacingConfig) for a given organization.
 * Upserts the record since it's a 1:1 relationship with organization.
 */
export async function saveFacingConfig(organizationId: string, config: FacingConfig): Promise<void> {
  const supabase = createAdminClient();
  
  const { error } = await supabase
    .from('surface_configurations')
    .upsert(
      {
        organization_id: organizationId,
        facing_config: config as any,
      },
      {
        onConflict: 'organization_id'
      }
    );

  if (error) {
    console.error('Failed to save surface configuration', error);
    throw new Error('Failed to save surface configuration');
  }
}
