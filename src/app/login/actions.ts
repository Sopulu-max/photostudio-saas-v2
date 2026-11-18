'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { claimStudio } from '@/weave/account/actions';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  let redirectUrl: string;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('Login Error:', error);
      // Supabase says "Invalid login credentials" for a wrong password and for
      // an address with no account alike, which is the right thing to say —
      // distinguishing them tells a stranger which addresses are real.
      redirectUrl = `/login?error=${encodeURIComponent(
        error.message === 'Invalid login credentials'
          ? 'That email and password do not match an account.'
          : error.message,
      )}`;
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
    const said = err instanceof Error ? err.message : 'Something went wrong signing in.';
    redirectUrl = `/login?error=${encodeURIComponent(said)}`;
  }

  redirect(redirectUrl);
}
