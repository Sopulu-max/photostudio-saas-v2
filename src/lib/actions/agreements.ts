'use server';

import { z } from 'zod';
import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
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
    const { data: workflow, error: wfError } = await supabaseAdmin
      .from('workflows')
      .insert({
        organization_id: params.organizationId,
        agreement_id: agreement.id,
        template_id: templateId,
      })
      .select()
      .single();

    if (wfError) {
      console.error('Failed to spawn workflow during activation:', wfError);
    } else if (workflow) {
      // FIX: Emit event for the spawned workflow (was missing before)
      await logEvent({
        organizationId: params.organizationId,
        entityType: 'workflow',
        entityId: workflow.id,
        action: 'created',
        actorId: params.actorId,
        payload: { agreementId: agreement.id, templateId, trigger: 'agreement_activation' }
      });

      // Also seed tasks from the workflow template's stage definitions
      const { data: wfTemplate } = await supabaseAdmin
        .from('workflow_templates')
        .select('stages')
        .eq('id', templateId)
        .single();

      const stages: any[] = (wfTemplate?.stages as any[]) || [];
      for (const [i, stage] of stages.entries()) {
        const { data: task, error: taskError } = await supabaseAdmin
          .from('tasks')
          .insert({
            organization_id: params.organizationId,
            workflow_id: workflow.id,
            stage_name: stage.name,
            stage_order: i,
          })
          .select()
          .single();

        if (!taskError && task) {
          await logEvent({
            organizationId: params.organizationId,
            entityType: 'task',
            entityId: task.id,
            action: 'created',
            actorId: params.actorId,
            payload: { stageName: stage.name, stageOrder: i, trigger: 'workflow_spawn' }
          });
        }
      }
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

export async function updateIntentStatus(
  intentId: string,
  organizationId: string,
  status: 'accepted' | 'declined' | 'reviewed',
  actorId: string
) {
  const VALID_INTENT_TRANSITIONS: Record<string, string[]> = {
    created:   ['reviewed', 'declined', 'withdrawn', 'expired'],
    reviewed:  ['accepted', 'declined', 'withdrawn'],
    accepted:  [], // Terminal — now an Agreement
    declined:  [],
    withdrawn: [],
    expired:   [],
  };

  const { data: current } = await supabaseAdmin
    .from('intents')
    .select('status')
    .eq('id', intentId)
    .single();

  if (!current) throw new Error('Intent not found');

  const allowed = VALID_INTENT_TRANSITIONS[current.status] || [];
  if (!allowed.includes(status)) {
    throw new Error(`Illegal intent state transition: '${current.status}' → '${status}'`);
  }

  const { data: intent, error } = await supabaseAdmin
    .from('intents')
    .update({ status })
    .eq('id', intentId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) throw new Error('Failed to update intent status');

  await logEvent({
    organizationId,
    entityType: 'intent',
    entityId: intent.id,
    action: 'status_updated',
    actorId,
    payload: { from: current.status, to: status }
  });

  return intent;
}
