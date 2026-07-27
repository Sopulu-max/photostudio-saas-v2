'use server';

import { createClient } from './server';
import { supabaseAdmin } from './admin';

/**
 * Resolves the authenticated user's organization ID.
 *
 * Strategy:
 * 1. Fast path — read from user_metadata in the JWT (set during create-studio onboarding).
 * 2. Fallback — look up via persons.auth_user_id for stale sessions
 *    (happens when metadata was just written but the session cookie hasn't refreshed).
 * 3. Last resort — look up via persons.email + role='configurator'.
 *
 * Throws if the user is not authenticated or has no organization.
 */
export async function getOptionalAuthOrgId(): Promise<{ userId: string; orgId: string; personId: string | null } | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  let orgId: string | null = null;

  // Fast path: org id already in JWT metadata
  if (user.user_metadata?.organization_id) {
    orgId = user.user_metadata.organization_id as string;
  }

  // Fallback: look up via persons.auth_user_id (set during onboarding)
  if (!orgId) {
    const { data: personByAuthId } = await supabaseAdmin
      .from('persons')
      .select('organization_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (personByAuthId?.organization_id) orgId = personByAuthId.organization_id;
  }

  // Last resort: look up via persons.email + configurator role
  if (!orgId && user.email) {
    const { data: personByEmail } = await supabaseAdmin
      .from('persons')
      .select('organization_id')
      .eq('email', user.email)
      .eq('role', 'configurator')
      .maybeSingle();
    if (personByEmail?.organization_id) orgId = personByEmail.organization_id;
  }

  if (!orgId) return null;

  // Resolve the acting person within this org. events.actor_id references
  // persons(id), so operator actions must attribute to a person — never the raw
  // auth user id. Prefer the linked auth_user_id, fall back to email.
  let personId: string | null = null;
  const { data: personById } = await supabaseAdmin
    .from('persons')
    .select('id')
    .eq('organization_id', orgId)
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (personById) {
    personId = personById.id;
  } else if (user.email) {
    const { data: personByEmail } = await supabaseAdmin
      .from('persons')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', user.email)
      .maybeSingle();
    if (personByEmail) personId = personByEmail.id;
  }

  return { userId: user.id, orgId, personId };
}

export async function getAuthOrgId(): Promise<{ userId: string; orgId: string; personId: string | null }> {
  const result = await getOptionalAuthOrgId();
  if (!result) {
    throw new Error('No organization found. Please complete studio setup at /create-studio');
  }
  return result;
}
