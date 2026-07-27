'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Intent, IntentStatus } from '../types/engine';

// Intents remain only as the record of a public inquiry — created by the /book
// flow and accepted through the client proposal portal. The internal
// convert/auto-book orchestration has been removed; a lead is a booking in an
// early state, handled from the Bookings hub.

// Valid state-machine transitions for an Intent.
const INTENT_TRANSITIONS: Record<string, IntentStatus[]> = {
  created:   ['reviewed', 'accepted', 'declined', 'withdrawn', 'expired'],
  reviewed:  ['accepted', 'declined', 'withdrawn'],
  accepted:  [],
  declined:  [],
  withdrawn: [],
  expired:   [],
};

export async function updateIntentStatus(
  intentId: string,
  organizationId: string,
  newStatus: IntentStatus,
  actorId: string
) {
  // STATE MACHINE GUARD
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('intents')
    .select('status')
    .eq('id', intentId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !current) {
    throw new Error('Intent not found');
  }

  const allowedTransitions = INTENT_TRANSITIONS[current.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Illegal intent state transition: '${current.status}' → '${newStatus}'. Allowed: [${allowedTransitions.join(', ')}]`
    );
  }

  const { data: intent, error } = await supabaseAdmin
    .from('intents')
    .update({ status: newStatus })
    .eq('id', intentId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update intent status:', error);
    throw new Error('Failed to update intent status');
  }

  await logEvent({
    organizationId,
    entityType: 'intent',
    entityId: intent.id,
    action: 'status_updated',
    actorId,
    payload: { from: current.status, to: newStatus }
  });

  return intent as Intent;
}
