'use server';

import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/actions/events';
import type { Contract } from '@/lib/types/engine';

const CreateContractSchema = z.object({
  organizationId: z.string().uuid(),
  intentId: z.string().uuid(),
  personId: z.string().uuid(),
  terms: z.record(z.string(), z.any()),
  actorId: z.string().uuid(),
});

const ActivateContractSchema = z.object({
  contractId: z.string().uuid(),
  organizationId: z.string().uuid(),
  actorId: z.string().uuid(),
});

export async function createContract(input: z.infer<typeof CreateContractSchema>) {
  const params = CreateContractSchema.parse(input);

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .insert({
      organization_id: params.organizationId,
      intent_id: params.intentId,
      person_id: params.personId,
      terms: params.terms,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create contract:', error);
    throw new Error('Failed to create contract');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'contract',
    entityId: contract.id,
    action: 'created',
    actorId: params.actorId,
    payload: { intentId: params.intentId }
  });

  return contract as Contract;
}

/**
 * Draft a contract for a booking — the composition path. No intent required
 * (the kernel is unlocked); the party is a kernel contact, with person_id
 * mirrored while the legacy column still exists.
 */
export async function draftContractForBooking(input: {
  organizationId: string;
  bookingId: string;
  contactId: string;
  legacyPersonId?: string | null;
  terms: Record<string, unknown>;
  actorId?: string | null;
}) {
  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .insert({
      organization_id: input.organizationId,
      booking_id: input.bookingId,
      contact_id: input.contactId,
      person_id: input.legacyPersonId ?? null,
      intent_id: null,
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
      .select('organization_id, person_id')
      .eq('id', input)
      .single();
    if (!ag) throw new Error('Contract not found');
    params = { contractId: input, organizationId: ag.organization_id, actorId: ag.person_id };
  } else {
    params = ActivateContractSchema.parse(input);
  }

  // STATE MACHINE GUARD
  const { data: currentContract, error: fetchError } = await supabaseAdmin
    .from('contracts')
    .select('status, person_id, intent_id')
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
