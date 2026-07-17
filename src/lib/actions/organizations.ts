'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Organization, PersonRole } from '../types/engine';

export async function createOrganization(name: string, slug?: string) {
  // 1. Create Organization
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({ name, slug: slug || null })
    .select()
    .single();

  if (orgError) {
    console.error('Failed to create organization:', orgError);
    throw new Error(orgError.message || 'Failed to create organization');
  }

  // 2. Log Event
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
