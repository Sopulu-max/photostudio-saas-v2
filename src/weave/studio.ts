import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { weave } from './db';

/**
 * Who is asking, and which studio — resolved once per request.
 *
 * The session is the one this app already issues, so being signed in here is
 * being signed in there; nobody logs in twice. What differs is where the answer
 * is looked up: `weave.people`, not `public.contacts`.
 *
 * Identity runs through `auth_user_id`, and ONLY through it.
 *
 * It used to fall back to matching on email when no row carried the account's
 * id. That was survivable while accounts were made by hand; it stopped being
 * survivable the moment anyone could sign up. `weave.people` holds a studio's
 * CLIENTS as well as its operators — every gallery visitor becomes a row — so
 * the fallback meant registering as ada@example.com and being handed operator
 * access to whichever studio Ada is a client of. The link is the claim now,
 * and an unlinked row proves nothing about who is asking.
 */
export type Who = {
  userId: string; personId: string; studioId: string; studioName: string;
} | null;

async function resolve(): Promise<Who> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  /*
   * Listed rather than fetched as one row. An account may hold a membership
   * at more than one studio — a photographer who second-shoots elsewhere is
   * one account with two — and `.maybeSingle()` does not return the first of
   * those, it throws. Asking for the list means the ambiguous case is
   * something this function decides, not something it crashes on.
   */
  /*
   * AND ONLY SOMEBODY WHO WORKS HERE.
   *
   * `auth_user_id` says which account a row belongs to. It does not say that
   * the account may run a studio, and this function hands out `studioId` —
   * which thirteen pages treat as the whole of their authorisation, gating on
   * `if (!who) redirect('/login')` and nothing further.
   *
   * `people` holds a studio's CLIENTS beside its operators, on purpose. So the
   * day a client is given an account — which is the plan — setting
   * `auth_user_id` on their row would have made them an operator of the studio
   * they are a customer of, with its whole book open to them. Nothing could
   * reach that yet, because founding was the only thing that ever wrote
   * `auth_user_id`; it was waiting for exactly the feature that is coming.
   *
   * Employment is the gate because employment is the fact: `joined_at` set and
   * `left_at` null is what `worksHere` has always meant. Somebody let go stops
   * being able to sign in, which is the other half of the same rule.
   *
   * A client's own identity needs a resolver of its own, one that deliberately
   * confers NO studio. It does not belong in this function.
   */
  const { data: memberships } = await weave
    .from('people')
    .select('id, studio_id, studio:studios(name)')
    .eq('auth_user_id', user.id)
    .not('joined_at', 'is', null)
    .is('left_at', null)
    .order('created_at', { ascending: true });

  const rows = (memberships ?? []) as unknown as
    { id: string; studio_id: string; studio: { name: string } | null }[];

  if (rows.length === 1) {
    const row = rows[0];
    return {
      userId: user.id, personId: row.id, studioId: row.studio_id,
      studioName: row.studio?.name ?? 'Studio',
    };
  }

  if (rows.length > 1) {
    /*
     * Nothing can produce this yet: founding makes exactly one membership and
     * there are no invitations. It is reachable the day invitations ship, and
     * on that day this must become a choice the operator makes and the app
     * remembers — not a guess made here. Showing the wrong studio's work is
     * worse than showing none, so until then it refuses, loudly.
     */
    console.error(
      `Account ${user.id} holds ${rows.length} studio memberships and nothing has `
      + 'said which is meant. Refusing to guess; a studio switcher is owed here.',
    );
  }
  return null;
}

export const whoIsAsking = cache(resolve);
