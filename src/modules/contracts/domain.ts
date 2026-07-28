'use server';

import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/kernel/events';
import type { Contract } from '@/lib/types/engine';

const ActivateContractSchema = z.object({
  contractId: z.string().uuid(),
  organizationId: z.string().uuid(),
  actorId: z.string().uuid(),
});

/**
 * Draft a contract for a booking — the composition path. The party is a kernel
 * contact; terms are whatever the booking's lines add up to.
 */
export async function draftContractForBooking(input: {
  organizationId: string;
  bookingId: string;
  contactId: string;
  terms: Record<string, unknown>;
  actorId?: string | null;
}) {
  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .insert({
      organization_id: input.organizationId,
      booking_id: input.bookingId,
      contact_id: input.contactId,
      terms: input.terms,
      status: 'proposed',
    })
    .select('id')
    .single();

  if (error || !contract) {
    console.error('Failed to draft contract for booking:', error);
    throw new Error('Failed to create contract');
  }

  await logEvent({
    organizationId: input.organizationId,
    entityType: 'contract',
    entityId: contract.id,
    action: 'created',
    actorId: input.actorId ?? undefined,
    payload: { bookingId: input.bookingId, source: 'booking_hub' },
  });

  return { contractId: contract.id };
}

export async function activateContract(input: z.infer<typeof ActivateContractSchema> | string) {
  // Support both object and plain string (contractId) for backward compat
  const rawInput = typeof input === 'string'
    ? { contractId: input, organizationId: '', actorId: '' }
    : input;

  // If called with just a string ID (legacy), fetch org from contract
  let params: z.infer<typeof ActivateContractSchema>;
  if (typeof input === 'string') {
    const { data: ag } = await supabaseAdmin
      .from('contracts')
      .select('organization_id, contact_id')
      .eq('id', input)
      .single();
    if (!ag) throw new Error('Contract not found');
    params = { contractId: input, organizationId: ag.organization_id, actorId: ag.contact_id };
  } else {
    params = ActivateContractSchema.parse(input);
  }

  // STATE MACHINE GUARD
  const { data: currentContract, error: fetchError } = await supabaseAdmin
    .from('contracts')
    .select('status, contact_id')
    .eq('id', params.contractId)
    .single();

  if (fetchError || !currentContract) {
    throw new Error('Contract not found');
  }

  if (!['proposed', 'modified'].includes(currentContract.status)) {
    throw new Error(`Illegal state transition. Cannot activate an contract in '${currentContract.status}' state.`);
  }

  // Activate contract
  const { data: contract, error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      status: 'active',
      signed_at: new Date().toISOString()
    })
    .eq('id', params.contractId)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to activate contract:', updateError);
    throw new Error('Failed to activate contract');
  }

  // Emit event for the contract activation itself
  await logEvent({
    organizationId: params.organizationId,
    entityType: 'contract',
    entityId: contract.id,
    action: 'activated',
    actorId: params.actorId,
    payload: { signed_at: contract.signed_at, previous_status: currentContract.status }
  });

  // No automatic spawning. Activating a contract only marks it active and
  // signed — it does not conjure a workflow, tasks, or an invoice. Not every
  // studio wants the "next thing" created for them; they add work or money from
  // the booking when and if they choose. (Composition, not orchestration.)
  return contract as Contract;
}
