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
 * Identity runs through `auth_user_id`. An email is a WEAKER claim — the same
 * address can belong to a person at more than one studio, and taking whichever
 * row came back first is how an operator ends up looking at somebody else's
 * work. So an email is honoured only when it names exactly ONE studio. No
 * studio is recoverable; the wrong studio is not.
 */
export type Who = { userId: string; personId: string; studioId: string } | null;

async function resolve(): Promise<Who> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: linked } = await weave
    .from('people')
    .select('id, studio_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (linked) return { userId: user.id, personId: linked.id, studioId: linked.studio_id };

  if (!user.email) return null;

  const { data: byEmail } = await weave
    .from('people')
    .select('id, studio_id')
    .eq('email', user.email);

  const rows = byEmail ?? [];
  const studios = [...new Set(rows.map((r) => r.studio_id))];

  if (studios.length === 1) {
    return { userId: user.id, personId: rows[0].id, studioId: studios[0] };
  }
  if (studios.length > 1) {
    console.error(
      `${user.email} is a person at ${studios.length} studios and no row carries `
      + `auth_user_id ${user.id}. Refusing to guess which is meant.`,
    );
  }
  return null;
}

export const whoIsAsking = cache(resolve);
