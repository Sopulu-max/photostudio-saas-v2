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

  if (error) {
    console.error('Signup Error:', error);
    return redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // Next steps: they will be redirected to the overview page.
  // The overview page will handle the "Create Organization" step if they have no org.
  revalidatePath('/', 'layout');
  redirect('/overview');
}
