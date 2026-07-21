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
export async function getOptionalAuthOrgId(): Promise<{ userId: string; orgId: string } | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Fast path: org id already in JWT metadata
  if (user.user_metadata?.organization_id) {
    return { userId: user.id, orgId: user.user_metadata.organization_id };
  }

  // Fallback: look up via persons.auth_user_id (most reliable, set during onboarding)
  const { data: personByAuthId } = await supabaseAdmin
    .from('persons')
    .select('organization_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (personByAuthId?.organization_id) {
    return { userId: user.id, orgId: personByAuthId.organization_id };
  }

  // Last resort: look up via persons.email + configurator role
  const { data: personByEmail } = await supabaseAdmin
    .from('persons')
    .select('organization_id')
    .eq('email', user.email)
    .eq('role', 'configurator')
    .maybeSingle();

  if (personByEmail?.organization_id) {
    return { userId: user.id, orgId: personByEmail.organization_id };
  }

  return null;
}

export async function getAuthOrgId(): Promise<{ userId: string; orgId: string }> {
  const result = await getOptionalAuthOrgId();
  if (!result) {
    throw new Error('No organization found. Please complete studio setup at /create-studio');
  }
  return result;
}
