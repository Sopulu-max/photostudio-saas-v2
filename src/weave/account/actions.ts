'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { weave as db } from '@/weave/db';

/**
 * Getting in, and getting back in.
 *
 * Founding a studio is three writes — an account, a studio, a person inside it
 * — and only the first belongs to Supabase Auth. The other two happen together
 * in `weave.found_studio`, because an account that exists without a studio can
 * sign in and then load nothing: every page asks `whoIsAsking`, gets null, and
 * sends it back to the login screen it just came from. A loop with no door.
 *
 * Nothing here trusts the project's email-confirmation setting. With
 * confirmation off, `signUp` hands back a session and the studio is founded on
 * the spot; with it on, no session comes back and the studio is founded when
 * the confirmation link lands on the callback. `found_studio` is idempotent, so
 * both paths can run and the second one is a no-op.
 */

/** Said back to the form rather than thrown, so the typing survives the error. */
export type AccountResult = { problem: string } | undefined;

function readableAuthError(message: string): string {
  const said = message.toLowerCase();
  if (said.includes('already registered') || said.includes('already been registered')) {
    return 'An account already exists for that address. Sign in, or reset the password.';
  }
  if (said.includes('password')) return 'Password must be at least eight characters.';
  if (said.includes('invalid') && said.includes('email')) return 'Enter a valid email address.';
  return message;
}

/**
 * Attach a studio to the signed-in account, or return the one already there.
 *
 * Safe to call on every sign-in. It is the only thing that creates a studio,
 * so it is the only place the metadata written at sign-up is read.
 */
export async function claimStudio(): Promise<{ studioId: string; personId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const meta = (user.user_metadata ?? {}) as { studio_name?: string; person_name?: string };
  const studioName = (meta.studio_name ?? '').trim();
  const personName = (meta.person_name ?? '').trim();

  // Somebody who was given an account by other means has no metadata to found
  // from. They are not broken — they already have a person row — so look, and
  // only refuse to invent a studio out of nothing.
  if (!studioName) {
    const { data } = await db.from('people')
      .select('id, studio_id').eq('auth_user_id', user.id).limit(1).maybeSingle();
    return data ? { studioId: data.studio_id, personId: data.id } : null;
  }

  const { data, error } = await db.rpc('found_studio', {
    p_auth_user_id: user.id,
    p_email: user.email,
    p_studio_name: studioName,
    p_person_name: personName,
  });

  if (error) {
    console.error('Could not found the studio:', error);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { studio_id: string; person_id: string } | undefined;
  if (!row) return null;

  await db.from('events').insert({
    studio_id: row.studio_id,
    subject_type: 'studio',
    subject_id: row.studio_id,
    action: 'studio_founded',
    actor_id: row.person_id,
    payload: { name: studioName },
  });

  return { studioId: row.studio_id, personId: row.person_id };
}

export async function signUpStudio(_prev: AccountResult, form: FormData): Promise<AccountResult> {
  const studioName = String(form.get('studioName') ?? '').trim();
  const personName = String(form.get('personName') ?? '').trim();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');

  if (!studioName) return { problem: 'Enter a studio name.' };
  if (!email) return { problem: 'Enter an email address.' };
  if (password.length < 8) return { problem: 'Password must be at least eight characters.' };

  const supabase = await createClient();
  const origin = await originOfThisRequest();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read back by claimStudio, on whichever path gets there first.
      data: { studio_name: studioName, person_name: personName },
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  });

  if (error) return { problem: readableAuthError(error.message) };

  // A session here means the project is not asking for confirmation, so the
  // studio can be founded now and the operator walks straight in.
  if (data.session) {
    const founded = await claimStudio();
    if (!founded) {
      return { problem: 'The account was made but the studio was not. Nothing was lost — log in and it will finish.' };
    }
    revalidatePath('/', 'layout');
    redirect('/');
  }

  redirect(`/signup/check-your-email?to=${encodeURIComponent(email)}`);
}

export async function requestPasswordReset(_prev: AccountResult, form: FormData): Promise<AccountResult> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!email) return { problem: 'Enter an email address.' };

  const supabase = await createClient();
  const origin = await originOfThisRequest();

  // The result is not reported. Saying "no account for that address" turns
  // this form into a way to ask which of a studio's addresses are real.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset`,
  });

  redirect(`/forgot/sent?to=${encodeURIComponent(email)}`);
}

export async function setNewPassword(_prev: AccountResult, form: FormData): Promise<AccountResult> {
  const password = String(form.get('password') ?? '');
  const again = String(form.get('again') ?? '');

  if (password.length < 8) return { problem: 'Password must be at least eight characters.' };
  if (password !== again) return { problem: 'Passwords do not match.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The recovery link is what signs them in; without it there is nobody to
  // change the password of, and this form must not be usable on its own.
  if (!user) return { problem: 'This reset link has expired. Request another.' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { problem: readableAuthError(error.message) };

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * The address this app is actually being reached on.
 *
 * Confirmation and reset links are built from it, so reading it from the
 * request rather than from a constant is what makes them work on localhost,
 * on a preview deployment and on the real domain without a setting to forget.
 */
async function originOfThisRequest(): Promise<string> {
  const { headers } = await import('next/headers');
  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const scheme = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${scheme}://${host}`;
}
