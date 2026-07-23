'use server';

import { z } from 'zod';
import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Intent, IntentStatus } from '../types/engine';

// Valid state machine transitions for Intent
const INTENT_TRANSITIONS: Record<string, IntentStatus[]> = {
  created:   ['reviewed', 'declined', 'withdrawn', 'expired'],
  reviewed:  ['accepted', 'declined', 'withdrawn'],
  accepted:  [], // Terminal — an Agreement exists
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

import { createAgreement, activateAgreement } from './agreements';

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

  // 4. Create Agreement
  const terms = {
    base_price: input.basePrice || 0,
    deposit_percentage: input.depositPercentage || 0,
    currency: input.currency || 'USD',
  };

  const agreement = await createAgreement({
    organizationId,
    intentId: intent.id,
    personId,
    terms,
    actorId: personId, // System/Client acting
  });

  // 5. Programmatically advance the Agreement state machine
  // (createAgreement naturally creates it in a state that activateAgreement accepts, e.g. 'proposed')
  // We do not need the hack anymore. We just call activateAgreement.
  await activateAgreement({
    agreementId: agreement.id,
    organizationId,
    actorId: personId,
  });

  // Return the spawned workflow id (if any) so the frontend can redirect
  const { data: workflow } = await supabaseAdmin
    .from('workflows')
    .select('id')
    .eq('agreement_id', agreement.id)
    .maybeSingle();

  return { intentId: intent.id, agreementId: agreement.id, personId, workflowId: workflow?.id };
}
