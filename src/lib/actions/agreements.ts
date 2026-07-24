'use server';

import { z } from 'zod';
import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import { createWorkflow, createTask } from './workflows';
import type { Agreement } from '../types/engine';

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
  const params = CreateAgreementSchema.parse(input);

  const { data: agreement, error } = await supabaseAdmin
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

export async function activateAgreement(input: z.infer<typeof ActivateAgreementSchema> | string) {
  // Support both object and plain string (agreementId) for backward compat
  const rawInput = typeof input === 'string'
    ? { agreementId: input, organizationId: '', actorId: '' }
    : input;

  // If called with just a string ID (legacy), fetch org from agreement
  let params: z.infer<typeof ActivateAgreementSchema>;
  if (typeof input === 'string') {
    const { data: ag } = await supabaseAdmin
      .from('agreements')
      .select('organization_id, person_id')
      .eq('id', input)
      .single();
    if (!ag) throw new Error('Agreement not found');
    params = { agreementId: input, organizationId: ag.organization_id, actorId: ag.person_id };
  } else {
    params = ActivateAgreementSchema.parse(input);
  }

  // STATE MACHINE GUARD
  const { data: currentAgreement, error: fetchError } = await supabaseAdmin
    .from('agreements')
    .select('status, person_id, intent_id')
    .eq('id', params.agreementId)
    .single();

  if (fetchError || !currentAgreement) {
    throw new Error('Agreement not found');
  }

  if (!['proposed', 'modified'].includes(currentAgreement.status)) {
    throw new Error(`Illegal state transition. Cannot activate an agreement in '${currentAgreement.status}' state.`);
  }

  // Activate agreement
  const { data: agreement, error: updateError } = await supabaseAdmin
    .from('agreements')
    .update({
      status: 'active',
      signed_at: new Date().toISOString()
    })
    .eq('id', params.agreementId)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to activate agreement:', updateError);
    throw new Error('Failed to activate agreement');
  }

  // Emit event for the agreement activation itself
  await logEvent({
    organizationId: params.organizationId,
    entityType: 'agreement',
    entityId: agreement.id,
    action: 'activated',
    actorId: params.actorId,
    payload: { signed_at: agreement.signed_at, previous_status: currentAgreement.status }
  });

  // KERNEL TRIGGER: Spawn Workflow
  const { data: intent } = await supabaseAdmin
    .from('intents')
    .select('service_template_id, template:service_templates(default_workflow_template_id)')
    .eq('id', agreement.intent_id)
    .single();

  const templateId = (intent?.template as any)?.default_workflow_template_id;

  if (templateId) {
    // Spawn the workflow and seed its tasks through the canonical kernel
    // operations (single source of truth for inserts + event emission).
    // A failed spawn must not roll back the already-committed activation,
    // so we log and continue rather than throw.
    try {
      const workflow = await createWorkflow({
        organizationId: params.organizationId,
        agreementId: agreement.id,
        templateId,
        actorId: params.actorId,
        meta: { trigger: 'agreement_activation' },
      });

      // Seed tasks from the workflow template's stage definitions
      const { data: wfTemplate } = await supabaseAdmin
        .from('workflow_templates')
        .select('stages')
        .eq('id', templateId)
        .single();

      const stages: any[] = (wfTemplate?.stages as any[]) || [];
      for (const [i, stage] of stages.entries()) {
        await createTask({
          organizationId: params.organizationId,
          workflowId: workflow.id,
          stageName: stage.name,
          stageOrder: i,
          actorId: params.actorId,
          meta: { trigger: 'workflow_spawn' },
        });
      }
    } catch (spawnError) {
      console.error('Failed to spawn workflow/tasks during activation:', spawnError);
    }
  }

  // KERNEL TRIGGER: Spawn Deposit Invoice
  const basePrice = agreement.terms?.base_price || 0;
  const depositPercent = agreement.terms?.deposit_percentage || 0;
  const depositAmount = (basePrice * depositPercent) / 100;

  if (depositAmount > 0) {
    const { data: tx, error: txError } = await supabaseAdmin
      .from('financial_transactions')
      .insert({
        organization_id: params.organizationId,
        agreement_id: agreement.id,
        person_id: agreement.person_id,
        direction: 'inbound',
        type: 'deposit_invoice',
        amount: depositAmount,
        currency: agreement.terms?.currency || 'USD',
        status: 'pending'
      })
      .select()
      .single();

    if (txError) {
      console.error('Failed to create deposit invoice:', txError);
    } else if (tx) {
      // FIX: Emit event for the spawned transaction (was missing before)
      await logEvent({
        organizationId: params.organizationId,
        entityType: 'financial_transaction',
        entityId: tx.id,
        action: 'created',
        actorId: params.actorId,
        payload: { type: 'deposit_invoice', amount: depositAmount, trigger: 'agreement_activation' }
      });
    }
  }

  return agreement as Agreement;
}
