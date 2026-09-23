'use server';

import { resolveAuthOrg } from './authOrg';

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
  /*
   * RESOLVED ONCE PER REQUEST, in authOrg.ts. Every read in this app starts by
   * asking who is asking, and each one used to ask again: a round trip to the
   * auth service and two queries, five to fifteen times over in a single page
   * render, for an answer that cannot change inside one request.
   */
  return resolveAuthOrg();
}

export async function getAuthOrgId(): Promise<{ userId: string; orgId: string; personId: string | null; contactId: string | null }> {
  const result = await getOptionalAuthOrgId();
  if (!result) {
    throw new Error('No organization found. Please complete studio setup at /create-studio');
  }
  return result;
}
