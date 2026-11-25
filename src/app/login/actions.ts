'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { claimStudio } from '@/weave/account/actions';

/*
 * Supabase reports an unreachable server as an AuthRetryableFetchError whose
 * message is the string "fetch failed". Passed through to the screen it sits
 * under the password box and reads as a rejected password, so the operator
 * concludes their password is wrong and changes a credential that was never
 * the problem. That happened. Say which of the two it is.
 */
function sayProblem(error: { message: string; status?: number }): string {
  if (error.status === 0 || error.message === 'fetch failed') {
    return 'Could not reach the server. Check the connection and try again.';
  }
  // Supabase says "Invalid login credentials" for a wrong password and for
  // an address with no account alike, which is the right thing to say —
  // distinguishing them tells a stranger which addresses are real.
  if (error.message === 'Invalid login credentials') {
    return 'That email and password do not match an account.';
  }
  return error.message;
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  let redirectUrl: string;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('Login Error:', error);
      redirectUrl = `/login?error=${encodeURIComponent(sayProblem(error))}`;
    } else {
      /*
       * Finishes a founding that did not complete. If an account was confirmed
       * but its studio was never created, every page would bounce it back to
       * this screen forever; doing it here means the second attempt fixes it
       * rather than repeating it. Idempotent, so the usual case is a lookup.
       */
      const inside = await claimStudio();
      if (!inside) {
        await supabase.auth.signOut();
        redirectUrl = `/login?error=${encodeURIComponent(
          'That account is not attached to a studio. Open one, or ask whoever runs yours to invite you.',
        )}`;
      } else {
        revalidatePath('/', 'layout');
        redirectUrl = '/';
      }
    }
  } catch (err) {
    console.error('Action Crash:', err);
    /* A thrown network failure reads the same way; name it the same way. */
    const said = err instanceof Error
      ? sayProblem({ message: err.message })
      : 'Something went wrong signing in.';
    redirectUrl = `/login?error=${encodeURIComponent(said)}`;
  }

  redirect(redirectUrl);
}
