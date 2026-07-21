'use server';

import { supabaseAdmin } from '../supabase/admin';
import { revalidatePath } from 'next/cache';

export async function createResource(formData: FormData) {
  const name = formData.get('name') as string;
  const type = formData.get('type') as string;
  const orgId = formData.get('orgId') as string;

  if (!name || !type || !orgId) throw new Error('Missing fields');

  const { error } = await supabaseAdmin
    .from('resources')
    .insert({
      organization_id: orgId,
      name,
      type,
      status: 'available',
      metadata: {}
    });

  if (error) {
    console.error(error);
    throw new Error('Failed to create resource');
  }

  revalidatePath('/resources');
}
