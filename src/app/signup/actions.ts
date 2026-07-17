'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signup(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  let redirectUrl: string;

  if (error) {
    console.error('Signup Error:', error);
    redirectUrl = `/signup?error=${encodeURIComponent(error.message)}`;
  } else {
    revalidatePath('/', 'layout');
    redirectUrl = '/';
  }

  try {
    redirect(redirectUrl);
  } catch (err: any) {
    if (err.message === 'NEXT_REDIRECT') {
      throw err;
    }
    console.error('Action Crash:', err);
    throw err;
  }
}
