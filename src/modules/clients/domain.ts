'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
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
    .select('id, status, source, created_at, contact:contacts(id, display_name, email, phone, avatar_url)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list clients:', error);
    throw new Error('Failed to load clients');
  }
  return data || [];
}

/** One client, with everything the detail page shows. */
export async function getClient(clientId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('clients')
    .select('id, status, source, notes, tags, created_at, contact:contacts(id, display_name, email, phone, avatar_url)')
    .eq('id', clientId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return data;
}

/**
 * A client was write-once until now. Identity (name/email/phone) lives on the
 * kernel contact; CRM depth (notes/tags/source) lives on the client row —
 * this updates whichever side the caller actually passed.
 */
export async function updateClient(input: {
  clientId: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags?: string[];
  source?: string | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: existing } = await supabaseAdmin
    .from('clients')
    .select('id, contact_id')
    .eq('id', input.clientId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!existing) throw new Error('Client not found');

  const contactPatch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('A client needs a name.');
    contactPatch.display_name = name;
  }
  if (input.email !== undefined) contactPatch.email = input.email || null;
  if (input.phone !== undefined) contactPatch.phone = input.phone || null;
  if (Object.keys(contactPatch).length > 0) {
    const { error } = await supabaseAdmin
      .from('contacts')
      .update(contactPatch)
      .eq('id', existing.contact_id)
      .eq('organization_id', orgId);
    if (error) {
      console.error('Failed to update client contact:', error);
      throw new Error('Failed to save the client');
    }
  }

  const clientPatch: Record<string, unknown> = {};
  if (input.notes !== undefined) clientPatch.notes = input.notes || null;
  if (input.tags !== undefined) clientPatch.tags = input.tags;
  if (input.source !== undefined) clientPatch.source = input.source || null;
  if (Object.keys(clientPatch).length > 0) {
    const { error } = await supabaseAdmin
      .from('clients')
      .update(clientPatch)
      .eq('id', input.clientId)
      .eq('organization_id', orgId);
    if (error) {
      console.error('Failed to update client:', error);
      throw new Error('Failed to save the client');
    }
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'client',
    entityId: input.clientId,
    action: 'updated',
    actorId: actorId ?? undefined,
    payload: { ...contactPatch, ...clientPatch },
  });

  revalidatePath('/clients');
  revalidatePath(`/clients/${input.clientId}`);
  return { ok: true };
}

/** Archive a client, or bring them back. Never deletes — past bookings keep their contact. */
export async function setClientStatus(input: { clientId: string; status: 'active' | 'archived' }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('clients')
    .update({ status: input.status })
    .eq('id', input.clientId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to change the client');

  await logEvent({
    organizationId: orgId,
    entityType: 'client',
    entityId: input.clientId,
    action: input.status === 'archived' ? 'archived' : 'restored',
    actorId: actorId ?? undefined,
  });

  revalidatePath('/clients');
  revalidatePath(`/clients/${input.clientId}`);
  return { ok: true };
}
