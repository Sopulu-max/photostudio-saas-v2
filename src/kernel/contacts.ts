'use server';

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { revalidatePath } from 'next/cache';

/**
 * A profile picture is identity, not CRM or employment depth — it lives on
 * the kernel contact, so a person who is both a client and a team member has
 * one photo, not two. Clients and Team both call these rather than each
 * growing their own upload path.
 */
export async function getAvatarUploadTarget(contactId: string, fileName: string) {
  const { orgId } = await getAuthOrgId();

  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!contact) throw new Error('Contact not found');

  const safeName = fileName.replace(/[^\w.\-]/g, '_');
  return { bucket: 'avatars', path: `${orgId}/${contactId}/${randomUUID()}-${safeName}` };
}

/** Record the uploaded photo against the contact (called after the upload lands). */
export async function setContactAvatar(input: { contactId: string; storagePath: string }) {
  const { orgId } = await getAuthOrgId();

  const { data: pub } = supabaseAdmin.storage.from('avatars').getPublicUrl(input.storagePath);

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ avatar_url: pub.publicUrl })
    .eq('id', input.contactId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to set avatar:', error);
    throw new Error('Failed to save the photo');
  }

  revalidatePath('/clients');
  revalidatePath('/team');
  return { url: pub.publicUrl };
}

/** Clear a contact's photo. The old file is left in storage, harmless. */
export async function removeContactAvatar(contactId: string) {
  const { orgId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ avatar_url: null })
    .eq('id', contactId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove the photo');

  revalidatePath('/clients');
  revalidatePath('/team');
  return { ok: true };
}
