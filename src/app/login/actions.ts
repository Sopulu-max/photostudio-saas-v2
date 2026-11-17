'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  let redirectUrl: string | null = null;

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Login Error:', error);
      redirectUrl = `/login?error=${encodeURIComponent(error.message)}`;
    } else {
      revalidatePath('/', 'layout');
      redirectUrl = '/';
    }
  } catch (err: any) {
    console.error('Action Crash:', err);
    redirectUrl = `/login?error=${encodeURIComponent(err.message || 'Unknown Server Action Crash')}`;
  }

  if (redirectUrl) {
    redirect(redirectUrl);
  }
}
