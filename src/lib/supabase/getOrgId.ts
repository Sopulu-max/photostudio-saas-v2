'use server';

import { createClient } from './server';
import { supabaseAdmin } from './admin';

/**
 * Resolves the authenticated user's organization ID.
 *
 * Strategy:
 * 1. Fast path — read from user_metadata in the JWT (set during create-studio onboarding).
 * 2. Fallback — look up via contacts.auth_user_id for stale sessions
 *    (happens when metadata was just written but the session cookie hasn't refreshed).
 * 3. Last resort — look up via contacts.email.
 *
 * Throws if the user is not authenticated or has no organization.
 */
export async function getOptionalAuthOrgId(): Promise<{ userId: string; orgId: string; personId: string | null; contactId: string | null } | null> {
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

  // Fallback: look up via contacts.auth_user_id (set during onboarding)
  if (!orgId) {
    const { data: contactByAuthId } = await supabaseAdmin
      .from('contacts')
      .select('organization_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (contactByAuthId?.organization_id) orgId = contactByAuthId.organization_id;
  }

  // Last resort: look up via contacts.email
  if (!orgId && user.email) {
    const { data: contactByEmail } = await supabaseAdmin
      .from('contacts')
      .select('organization_id')
      .eq('email', user.email)
      .limit(1)
      .maybeSingle();
    if (contactByEmail?.organization_id) orgId = contactByEmail.organization_id;
  }

  if (!orgId) return null;

  // Resolve the acting CONTACT within this org. events.actor_id references
  // contacts(id) — operator actions attribute to a kernel contact, never the
  // raw auth user id. Prefer the linked auth_user_id, fall back to email.
  let contactId: string | null = null;
  const { data: contactById } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (contactById) {
    contactId = contactById.id;
  } else if (user.email) {
    const { data: contactByEmail } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', user.email)
      .maybeSingle();
    if (contactByEmail) contactId = contactByEmail.id;
  }

  // `personId` is kept as an alias of the acting contact: every caller uses it
  // purely as the actor id for logEvent, and that now means a contact.
  return { userId: user.id, orgId, personId: contactId, contactId };
}

export async function getAuthOrgId(): Promise<{ userId: string; orgId: string; personId: string | null; contactId: string | null }> {
  const result = await getOptionalAuthOrgId();
  if (!result) {
    throw new Error('No organization found. Please complete studio setup at /create-studio');
  }
  return result;
}
