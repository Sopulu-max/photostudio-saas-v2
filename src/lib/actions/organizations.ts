'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Organization, PersonRole } from '../types/engine';

export async function createOrganization(name: string, slug?: string) {
  // 1. Get the current authenticated user
  const { createClient } = await import('../supabase/server');
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be logged in to create a studio.');
  }

  // 2. Create Organization
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({ name, slug: slug || null })
    .select()
    .single();

  if (orgError) {
    console.error('Failed to create organization:', orgError);
    throw new Error(orgError.message || 'Failed to create organization');
  }

  // 3. Create Person Record for the Configurator
  const { error: personError } = await supabaseAdmin
    .from('persons')
    .insert({
      organization_id: org.id,
      role: 'configurator',
      display_name: user.email?.split('@')[0] || 'Studio Owner',
      email: user.email
    });

  if (personError) {
    console.error('Failed to create person record:', personError);
    throw new Error(personError.message || 'Failed to create person record');
  }

  // 4. Update the user's Auth metadata to link to the new Organization
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      organization_id: org.id
    }
  });

  if (updateError) {
    console.error('Failed to update user metadata:', updateError);
    throw new Error(updateError.message || 'Failed to link user to organization');
  }

  // 5. Log Event
  await logEvent({
    organizationId: org.id,
    entityType: 'organization',
    entityId: org.id,
    action: 'created',
    payload: { name, slug }
  });

  return org as Organization;
}

export async function updateOrganizationStatus(organizationId: string, status: 'active' | 'suspended' | 'archived') {
  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .update({ status })
    .eq('id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update organization status:', error);
    throw new Error('Failed to update organization status');
  }

  await logEvent({
    organizationId,
    entityType: 'organization',
    entityId: organizationId,
    action: 'status_updated',
    payload: { status }
  });

  return org as Organization;
}
