'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/kernel/events';
import type { Organization } from '@/lib/types/engine';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { revalidatePath } from 'next/cache';

export async function createOrganization(name: string, slug?: string) {
  // 1. Get the current authenticated user
  const { createClient } = await import('@/lib/supabase/server');
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

  // 3. The owner's identity: a kernel contact (linked to their login) and an
  //    employee record in the Team module.
  const { data: contact, error: contactError } = await supabaseAdmin
    .from('contacts')
    .insert({
      organization_id: org.id,
      display_name: user.email?.split('@')[0] || 'Studio Owner',
      email: user.email,
      auth_user_id: user.id,
    })
    .select('id')
    .single();

  if (contactError || !contact) {
    console.error('Failed to create owner contact:', contactError);
    throw new Error(contactError?.message || 'Failed to create your studio identity');
  }

  const { error: employeeError } = await supabaseAdmin
    .from('employees')
    .insert({ organization_id: org.id, contact_id: contact.id, title: 'Owner' });

  if (employeeError) {
    console.error('Failed to create owner employee record:', employeeError);
    throw new Error(employeeError.message || 'Failed to add you to the team');
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

/** Who this studio is — name and storefront slug, for surfaces that greet or link to it. */
export async function getStudio(): Promise<{ id: string; name: string; slug: string | null } | null> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle();
  return (data as { id: string; name: string; slug: string | null }) ?? null;
}

/**
 * Who can actually sign in to this studio — distinct from the Team roster,
 * which is about who does the work. Identity is a kernel concern, so it is
 * answered here rather than by any one module.
 */
export async function listStudioLogins(): Promise<{ id: string; name: string; email: string | null }[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, email')
    .eq('organization_id', orgId)
    .not('auth_user_id', 'is', null)
    .order('display_name');
  if (error) {
    console.error('Failed to list studio logins:', error);
    return [];
  }
  return ((data || []) as any[]).map((c) => ({ id: c.id, name: c.display_name, email: c.email ?? null }));
}

/** The currency this studio bills in. Every money surface reads this. */
export async function getStudioCurrency(): Promise<string> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('currency')
    .eq('id', orgId)
    .maybeSingle();
  return data?.currency || 'USD';
}

/** Change the currency the studio bills in (global setting). */
export async function setStudioCurrency(code: string) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ currency: code })
    .eq('id', orgId);
  if (error) throw new Error('Failed to set the currency');
  revalidatePath('/settings');
  revalidatePath('/services');
  return { ok: true };
}

/**
 * Rename the studio, or change the handle its public links use.
 *
 * The slug is in every public URL (/book/<slug>/…), so changing it breaks links
 * already shared with clients — the UI says so before you do it.
 */
export async function updateStudio(input: { name?: string; slug?: string }) {
  const { orgId } = await getAuthOrgId();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Your studio needs a name.');
    patch.name = name;
  }
  if (input.slug !== undefined) {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) throw new Error('The handle needs at least one letter or number.');
    patch.slug = slug;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from('organizations')
    .update(patch)
    .eq('id', orgId);
  if (error) {
    console.error('Failed to update studio:', error);
    throw new Error('Failed to save (is that handle already taken?)');
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true };
}
