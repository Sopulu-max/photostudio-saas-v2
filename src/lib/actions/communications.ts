'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import { revalidatePath } from 'next/cache';
import type { Event } from '../types/engine';

export interface SendMessageParams {
  organizationId: string;
  entityType: string;
  entityId: string;
  actorId: string;
  text: string;
  senderRole: 'client' | 'studio';
}

/**
 * Sends a message by logging it as an event in the organizational memory.
 * This ensures strict adherence to the 10-table core ontology while
 * maintaining an immutable audit log of all communications.
 */
export async function sendMessage(params: SendMessageParams) {
  // Store the message as an event
  await logEvent({
    organizationId: params.organizationId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: 'message_sent',
    actorId: params.actorId,
    payload: {
      text: params.text,
      senderRole: params.senderRole
    }
  });

  // Revalidate relevant pages based on entityType
  if (params.entityType === 'workflow') {
    revalidatePath(`/workflows/${params.entityId}`);
  } else if (params.entityType === 'agreement') {
    revalidatePath(`/agreements/${params.entityId}`);
  }
}

/**
 * Retrieves all messages for a specific entity from the events table.
 */
export async function getMessages(organizationId: string, entityType: string, entityId: string): Promise<Event[]> {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select(`
      *,
      person:persons(display_name, role)
    `)
    .eq('organization_id', organizationId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('action', 'message_sent')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch messages:', error);
    throw new Error('Failed to fetch messages');
  }

  return data as Event[];
}
