'use server';

import { z } from 'zod';
import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import { createWorkflow, createTask } from './workflows';
import type { Contract } from '../types/engine';

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

  // KERNEL TRIGGER: Spawn Workflow
  const { data: intent } = await supabaseAdmin
    .from('intents')
    .select('service_template_id, template:service_templates(default_workflow_template_id)')
    .eq('id', contract.intent_id)
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
        contractId: contract.id,
        templateId,
        actorId: params.actorId,
        meta: { trigger: 'contract_activation' },
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
  const basePrice = contract.terms?.base_price || 0;
  const depositPercent = contract.terms?.deposit_percentage || 0;
  const depositAmount = (basePrice * depositPercent) / 100;

  if (depositAmount > 0) {
    const { data: tx, error: txError } = await supabaseAdmin
      .from('financial_transactions')
      .insert({
        organization_id: params.organizationId,
        contract_id: contract.id,
        person_id: contract.person_id,
        direction: 'inbound',
        type: 'deposit_invoice',
        amount: depositAmount,
        currency: contract.terms?.currency || 'USD',
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
        payload: { type: 'deposit_invoice', amount: depositAmount, trigger: 'contract_activation' }
      });
    }
  }

  return contract as Contract;
}
