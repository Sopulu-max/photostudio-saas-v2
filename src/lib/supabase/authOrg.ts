import { cache } from 'react';
import { createClient } from './server';
import { supabaseAdmin } from './admin';

/**
 * WHO IS ASKING, RESOLVED ONCE PER REQUEST.
 *
 * Every read in this app begins by asking who is asking: the authenticated
 * user, their studio, and the contact that studio attributes their actions to.
 * That answer costs a round trip to the auth service plus two queries - and it
 * was asked again by every function in the call tree. One bookings page render
 * asked between five and fifteen times, for an answer that cannot change
 * inside a single request. That, more than any page, is why the app felt like
 * a website: most of the wait was the same question, asked over and over.
 *
 * `cache` is React's per-request memo: the first caller pays, every caller
 * after it in the same request gets that same answer. NOTHING IS SHARED
 * BETWEEN REQUESTS, so nothing is shared between studios - the multi-tenant
 * mandate is untouched, and this is the only place that could have broken it.
 *
 * It lives apart from getOrgId.ts because that is a 'use server' module, where
 * every export must be an async function and a memo is not one. The strategy
 * below is unchanged: the token's metadata first, then the contact rows, then
 * the email, then a check that the studio named still exists.
 */

type AuthOrg = { userId: string; orgId: string; personId: string | null; contactId: string | null } | null;
async function resolve(): Promise<AuthOrg> {
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

  /*
   * Last resort: the email on a contact row.
   *
   * IDENTITY RUNS THROUGH contacts.auth_user_id. An email is a weaker claim,
   * because the SAME ADDRESS CAN BE A CONTACT IN SEVERAL STUDIOS AT ONCE - a
   * photographer who shoots for two of them, an address used to try the app
   * against more than one, or a studio that holds its own operator as a client
   * somewhere else. contacts is the one kernel table; clients and employees are
   * modules sitting on top of it, so a row here does not even say the person
   * works at that studio.
   *
   * This asked for `.limit(1)` and took whatever came back. With one matching
   * row that is correct; with several, WHICH STUDIO AN OPERATOR LANDED IN WAS
   * WHATEVER ORDER THE DATABASE HAPPENED TO RETURN, and the wrong answer opens
   * another studio's book to them. Nothing announced it, because one studio's
   * cockpit looks exactly like another's.
   *
   * So an email is honoured only when it names ONE studio. Where it names
   * several the app genuinely does not know which is meant, and NO STUDIO is
   * the only safe answer: it sends the operator to studio setup, which is
   * recoverable, instead of into data that is not theirs, which is not.
   * Linking auth_user_id on the contact is what retires this path entirely.
   */
  if (!orgId && user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from('contacts')
      .select('organization_id')
      .eq('email', user.email)
      .not('organization_id', 'is', null);

    // Deduplicated by studio: the same address twice inside ONE studio is still
    // one answer, and only a second STUDIO makes the claim ambiguous.
    const studios = [...new Set(((byEmail || []) as { organization_id: string }[]).map((c) => c.organization_id))];

    if (studios.length === 1) {
      orgId = studios[0];
    } else if (studios.length > 1) {
      console.error(
        `${user.email} is a contact in ${studios.length} studios and no contact row carries auth_user_id `
        + `${user.id}. Refusing to guess which studio is meant; treating as no studio. `
        + 'Set contacts.auth_user_id on the right row to resolve this.',
      );
      return null;
    }
  }

  if (!orgId) return null;

  /*
   * The studio in the token has to still exist.
   *
   * The id is read from user_metadata, which is written once at signup and then
   * never revisited — so a session goes on naming a studio long after that
   * studio has gone. Every query then passes an organization_id no row
   * references, and the failure surfaces as a foreign key violation several
   * layers down: "Key (organization_id)=(…) is not present in table
   * organizations", from inside createService, with a 500 on the page and
   * nothing said about the actual problem.
   *
   * Checked here instead, where the answer is either a real studio or none.
   * None sends the operator to studio setup, which is exactly what a person
   * with no studio should see.
   */
  const { data: studio } = await supabaseAdmin
    .from('organizations').select('id').eq('id', orgId).maybeSingle();
  if (!studio) {
    // The token may be stale rather than wrong: the contact rows are the
    // durable record of who belongs where, so they get the last word.
    const { data: byContact } = await supabaseAdmin
      .from('contacts')
      .select('organization_id')
      .eq('auth_user_id', user.id)
      .not('organization_id', 'is', null)
      .maybeSingle();

    if (byContact?.organization_id && byContact.organization_id !== orgId) {
      orgId = byContact.organization_id as string;
    } else {
      console.error(
        `Session names organization ${orgId}, which no longer exists, and ${user.email ?? user.id} ` +
        'belongs to no other. Treating as no studio.',
      );
      return null;
    }
  }

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

/** The memo itself: one resolution per request, whoever asks. */
export const resolveAuthOrg = cache(resolve);
