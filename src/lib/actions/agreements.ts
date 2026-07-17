'use server';

import { z } from 'zod';
import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Agreement } from '../types/engine';

// 1. Input Validation Schemas
const CreateAgreementSchema = z.object({
  organizationId: z.string().uuid(),
  intentId: z.string().uuid(),
  personId: z.string().uuid(),
  terms: z.record(z.string(), z.any()),
  actorId: z.string().uuid(),
});

const ActivateAgreementSchema = z.object({
  agreementId: z.string().uuid(),
  organizationId: z.string().uuid(),
  actorId: z.string().uuid(),
});

export async function createAgreement(input: z.infer<typeof CreateAgreementSchema>) {
  // Validate Input
  const params = CreateAgreementSchema.parse(input);

  // TODO: Replace supabaseAdmin with authenticated SSR client once Auth is configured.
  // const supabase = createServerClient();
  // const { data: { user } } = await supabase.auth.getUser();
  // if (!user) throw new Error('Unauthorized');
  const supabase = supabaseAdmin; 

  const { data: agreement, error } = await supabase
    .from('agreements')
    .insert({
      organization_id: params.organizationId,
      intent_id: params.intentId,
      person_id: params.personId,
      terms: params.terms,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create agreement:', error);
    throw new Error('Failed to create agreement');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'agreement',
    entityId: agreement.id,
    action: 'created',
    actorId: params.actorId,
    payload: { intentId: params.intentId }
  });

  return agreement as Agreement;
}

export async function activateAgreement(input: z.infer<typeof ActivateAgreementSchema>) {
  // 1. Validate Input
  const params = ActivateAgreementSchema.parse(input);
  const supabase = supabaseAdmin; // TODO: Replace with authenticated SSR client

  // 2. State Machine Guard: Fetch current state to ensure legal transition
  const { data: currentAgreement, error: fetchError } = await supabase
    .from('agreements')
    .select('status')
    .eq('id', params.agreementId)
    .eq('organization_id', params.organizationId)
    .single();

  if (fetchError || !currentAgreement) {
    throw new Error('Agreement not found');
  }

  // A legal transition to 'active' can only happen from 'proposed' or 'modified'
  if (!['proposed', 'modified'].includes(currentAgreement.status)) {
    throw new Error(`Illegal state transition. Cannot activate an agreement in '${currentAgreement.status}' state.`);
  }

  // 3. Mutate Database
  const { data: agreement, error: updateError } = await supabase
    .from('agreements')
    .update({ 
      status: 'active',
      signed_at: new Date().toISOString()
    })
    .eq('id', params.agreementId)
    .eq('organization_id', params.organizationId)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to activate agreement:', updateError);
    throw new Error('Failed to activate agreement');
  }

  // 4. Emit Event
  await logEvent({
    organizationId: params.organizationId,
    entityType: 'agreement',
    entityId: agreement.id,
    action: 'activated',
    actorId: params.actorId,
    payload: { signed_at: agreement.signed_at, previous_status: currentAgreement.status }
  });

  return agreement as Agreement;
}
