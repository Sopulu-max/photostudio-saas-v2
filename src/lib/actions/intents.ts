'use server';

import { z } from 'zod';
import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Intent, IntentStatus } from '../types/engine';

// Valid state machine transitions for Intent
const INTENT_TRANSITIONS: Record<string, IntentStatus[]> = {
  created:   ['reviewed', 'declined', 'withdrawn', 'expired'],
  reviewed:  ['accepted', 'declined', 'withdrawn'],
  accepted:  [], // Terminal — an Contract exists
  declined:  [],
  withdrawn: [],
  expired:   [],
};

const CreateIntentSchema = z.object({
  organizationId: z.string().uuid(),
  personId: z.string().uuid(),
  source: z.string().optional(),
  description: z.string().optional(),
  serviceTemplateId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  actorId: z.string().uuid().optional(),
});

export async function createIntent(input: z.infer<typeof CreateIntentSchema>) {
  const params = CreateIntentSchema.parse(input);
  const actor = params.actorId || params.personId;

  const { data: intent, error } = await supabaseAdmin
    .from('intents')
    .insert({
      organization_id: params.organizationId,
      person_id: params.personId,
      source: params.source || null,
      description: params.description || null,
      service_template_id: params.serviceTemplateId || null,
      metadata: params.metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create intent:', error);
    throw new Error('Failed to create intent');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'intent',
    entityId: intent.id,
    action: 'created',
    actorId: actor,
    payload: { source: params.source, serviceTemplateId: params.serviceTemplateId }
  });

  return intent as Intent;
}

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

import { createContract, activateContract } from './contracts';

export async function autoBookService(input: {
  organizationId: string;
  serviceTemplateId?: string;
  clientInfo: {
    name: string;
    email: string;
    phone?: string;
  };
  formData: any;
  basePrice?: number;
  depositPercentage?: number;
  currency?: string;
}) {
  const { organizationId, serviceTemplateId, clientInfo, formData } = input;

  // 1. Find or Create Person
  let personId;
  const { data: existingPerson } = await supabaseAdmin
    .from('persons')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('email', clientInfo.email)
    .maybeSingle();

  if (existingPerson) {
    personId = existingPerson.id;
  } else {
    const { data: newPerson, error: personError } = await supabaseAdmin
      .from('persons')
      .insert({
        organization_id: organizationId,
        display_name: clientInfo.name,
        email: clientInfo.email,
        phone: clientInfo.phone || null,
        role: 'client',
      })
      .select()
      .single();

    if (personError) throw new Error('Failed to create person record');
    personId = newPerson.id;
    
    await logEvent({
      organizationId,
      entityType: 'person',
      entityId: personId,
      action: 'created',
      payload: { source: 'auto_booking' }
    });
  }

  // 2. Create Intent (The Inquiry)
  const intent = await createIntent({
    organizationId,
    personId,
    source: 'storefront_booking',
    serviceTemplateId: serviceTemplateId || undefined,
    metadata: { form_data: formData, autoBooked: true },
    actorId: personId,
  });

  // 3. Programmatically advance the Intent state machine
  await updateIntentStatus(intent.id, organizationId, 'reviewed', personId);
  await updateIntentStatus(intent.id, organizationId, 'accepted', personId);

  // 4. Create Contract
  const terms = {
    base_price: input.basePrice || 0,
    deposit_percentage: input.depositPercentage || 0,
    currency: input.currency || 'USD',
  };

  const contract = await createContract({
    organizationId,
    intentId: intent.id,
    personId,
    terms,
    actorId: personId, // System/Client acting
  });

  // 5. Programmatically advance the Contract state machine
  // (createContract naturally creates it in a state that activateContract accepts, e.g. 'proposed')
  // We do not need the hack anymore. We just call activateContract.
  await activateContract({
    contractId: contract.id,
    organizationId,
    actorId: personId,
  });

  // Return the spawned workflow id (if any) so the frontend can redirect
  const { data: workflow } = await supabaseAdmin
    .from('workflows')
    .select('id')
    .eq('contract_id', contract.id)
    .maybeSingle();

  return { intentId: intent.id, contractId: contract.id, personId, workflowId: workflow?.id };
}

/**
 * Manual (operator-driven) conversion of an existing inquiry into an Contract.
 *
 * This is the by-hand counterpart to autoBookService's public path: an operator
 * looking at an intent in the dashboard turns it into a formal proposal. It
 * advances the intent state machine to 'accepted' and creates the contract
 * carrying the service's real pricing into terms — so a later activation can
 * compute the deposit correctly (the previous flow wrote malformed terms and
 * the deposit always came out zero).
 *
 * The contract is created in its 'proposed' state; activation (which fires the
 * workflow + deposit cascade) is a deliberate second step on the contract page.
 */
export async function convertIntentToContract(input: {
  intentId: string;
  organizationId: string;
  actorId: string;
}) {
  const { intentId, organizationId, actorId } = input;

  const { data: intent, error } = await supabaseAdmin
    .from('intents')
    .select('id, person_id, status, service_template_id, template:service_templates(pricing)')
    .eq('id', intentId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !intent) throw new Error('Intent not found');

  // Idempotency: never create a second contract for the same inquiry.
  const { data: existing } = await supabaseAdmin
    .from('contracts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('intent_id', intentId)
    .maybeSingle();

  if (existing) return { contractId: existing.id };

  // Walk the state machine to its terminal 'accepted' from wherever it is.
  if (intent.status === 'created') {
    await updateIntentStatus(intentId, organizationId, 'reviewed', actorId);
    await updateIntentStatus(intentId, organizationId, 'accepted', actorId);
  } else if (intent.status === 'reviewed') {
    await updateIntentStatus(intentId, organizationId, 'accepted', actorId);
  }

  const pricing = (intent.template as any)?.pricing || {};
  const terms = {
    base_price: pricing.base_price || 0,
    deposit_percentage: pricing.deposit_percentage || 0,
    currency: pricing.currency || 'USD',
    service_template_id: intent.service_template_id || null,
  };

  const contract = await createContract({
    organizationId,
    intentId,
    personId: intent.person_id,
    terms,
    actorId,
  });

  return { contractId: contract.id };
}
