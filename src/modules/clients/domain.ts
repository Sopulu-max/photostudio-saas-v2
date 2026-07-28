'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/lib/actions/events';
import { revalidatePath } from 'next/cache';

/**
 * Clients — who the studio sells to. A client specialises a kernel contact
 * (identity lives on the contact; CRM depth lives here).
 */
export async function createClient(input: { name: string; email?: string; phone?: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('A client needs a name.');

  const { data: contact, error: cErr } = await supabaseAdmin
    .from('contacts')
    .insert({
      organization_id: orgId,
      display_name: name,
      email: input.email || null,
      phone: input.phone || null,
    })
    .select('id')
    .single();
  if (cErr || !contact) {
    console.error('Failed to create client (contact):', cErr);
    throw new Error('Failed to create client');
  }

  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .insert({ organization_id: orgId, contact_id: contact.id })
    .select('id')
    .single();
  if (error || !client) {
    console.error('Failed to create client:', error);
    throw new Error('Failed to create client');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'client',
    entityId: client.id,
    action: 'created',
    actorId: actorId ?? undefined,
    payload: { name },
  });

  revalidatePath('/clients');
  return { clientId: client.id, contactId: contact.id };
}

/** List clients with their contact identity, for pickers and the list surface. */
export async function listClients() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, status, source, created_at, contact:contacts(id, display_name, email, phone)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list clients:', error);
    throw new Error('Failed to load clients');
  }
  return data || [];
}
