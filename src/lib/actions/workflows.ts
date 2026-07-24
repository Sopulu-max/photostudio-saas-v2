'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Workflow, Task, TaskStatus, WorkflowStatus, WorkflowTemplate, WorkflowStageDefinition } from '../types/engine';
import { revalidatePath } from 'next/cache';
import { getAuthOrgId } from '../supabase/getOrgId';

// Valid state machine transitions for Task
const TASK_TRANSITIONS: Record<string, TaskStatus[]> = {
  created:     ['assigned', 'in_progress'],
  assigned:    ['in_progress', 'blocked', 'created'],
  in_progress: ['blocked', 'completed'],
  blocked:     ['in_progress', 'created'],
  completed:   [], // Terminal state
};

// Valid state machine transitions for Workflow
const WORKFLOW_TRANSITIONS: Record<string, WorkflowStatus[]> = {
  created:     ['in_progress', 'halted'],
  in_progress: ['completed', 'halted'],
  completed:   [], // Terminal state
  halted:      ['in_progress'], // Can resume
};

export async function createWorkflow(params: {
  organizationId: string;
  agreementId: string;
  templateId?: string;
  actorId: string;
  meta?: Record<string, unknown>;
}) {
  const { data: workflow, error } = await supabaseAdmin
    .from('workflows')
    .insert({
      organization_id: params.organizationId,
      agreement_id: params.agreementId,
      template_id: params.templateId || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create workflow:', error);
    throw new Error('Failed to create workflow');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'workflow',
    entityId: workflow.id,
    action: 'created',
    actorId: params.actorId,
    payload: { agreementId: params.agreementId, templateId: params.templateId, ...(params.meta || {}) }
  });

  return workflow as Workflow;
}

export async function createTask(params: {
  organizationId: string;
  workflowId: string;
  stageName: string;
  stageOrder: number;
  assignedPersonId?: string;
  dueDate?: string;
  actorId: string;
  meta?: Record<string, unknown>;
}) {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      organization_id: params.organizationId, // FIX: was missing
      workflow_id: params.workflowId,
      stage_name: params.stageName,
      stage_order: params.stageOrder,
      assigned_person_id: params.assignedPersonId || null,
      due_date: params.dueDate || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create task:', error);
    throw new Error('Failed to create task');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'task',
    entityId: task.id,
    action: 'created',
    actorId: params.actorId,
    payload: { stageName: params.stageName, stageOrder: params.stageOrder, workflowId: params.workflowId, ...(params.meta || {}) }
  });

  return task as Task;
}

export async function updateTaskStatus(
  taskId: string,
  organizationId: string,
  newStatus: TaskStatus,
  actorId: string
) {
  // STATE MACHINE GUARD: Fetch current state
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !current) {
    throw new Error('Task not found');
  }

  const allowedTransitions = TASK_TRANSITIONS[current.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Illegal task state transition: '${current.status}' → '${newStatus}'. Allowed: [${allowedTransitions.join(', ')}]`
    );
  }

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .update({ status: newStatus })
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update task status:', error);
    throw new Error('Failed to update task status');
  }

  await logEvent({
    organizationId,
    entityType: 'task',
    entityId: task.id,
    action: 'status_updated',
    actorId,
    payload: { from: current.status, to: newStatus }
  });

  return task as Task;
}

export async function updateWorkflowStatus(
  workflowId: string,
  organizationId: string,
  newStatus: WorkflowStatus,
  actorId: string
) {
  // STATE MACHINE GUARD
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('workflows')
    .select('status')
    .eq('id', workflowId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !current) {
    throw new Error('Workflow not found');
  }

  const allowedTransitions = WORKFLOW_TRANSITIONS[current.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Illegal workflow state transition: '${current.status}' → '${newStatus}'. Allowed: [${allowedTransitions.join(', ')}]`
    );
  }

  const { data: workflow, error } = await supabaseAdmin
    .from('workflows')
    .update({ status: newStatus })
    .eq('id', workflowId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update workflow status:', error);
    throw new Error('Failed to update workflow status');
  }

  await logEvent({
    organizationId,
    entityType: 'workflow',
    entityId: workflow.id,
    action: 'status_updated',
    actorId,
    payload: { from: current.status, to: newStatus }
  });

  return workflow as Workflow;
}

export async function createWorkflowTemplate(
  name: string,
  stages: WorkflowStageDefinition[]
): Promise<WorkflowTemplate> {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('workflow_templates')
    .insert([{
      organization_id: orgId,
      name,
      stages,
      status: 'active',
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating workflow template:', error, { orgId, name });
    throw new Error(`Failed to create workflow template: ${error.message}`);
  }

  revalidatePath('/workflows/templates');
  return data as WorkflowTemplate;
}
