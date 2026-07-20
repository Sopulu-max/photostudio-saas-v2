'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { Workflow, Task, TaskStatus, WorkflowStatus, WorkflowTemplate, WorkflowStageDefinition } from '../types/engine';
import { createClient } from '../supabase/server';
import { revalidatePath } from 'next/cache';

export async function createWorkflow(params: {
  organizationId: string;
  agreementId: string;
  templateId?: string;
  actorId: string;
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
    payload: { agreementId: params.agreementId, templateId: params.templateId }
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
}) {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
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
    payload: { stageName: params.stageName, workflowId: params.workflowId }
  });

  return task as Task;
}

export async function updateTaskStatus(
  taskId: string,
  organizationId: string,
  status: TaskStatus,
  actorId: string
) {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .update({ status })
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
    payload: { status }
  });

  return task as Task;
}

export async function getWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.user_metadata?.organization_id) {
    throw new Error('Not authenticated or no organization context');
  }

  const { data, error } = await supabase
    .from('workflow_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching workflow templates:', error);
    throw new Error('Failed to fetch workflow templates');
  }

  return data as WorkflowTemplate[];
}

export async function createWorkflowTemplate(
  name: string,
  stages: WorkflowStageDefinition[]
): Promise<WorkflowTemplate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.user_metadata?.organization_id) {
    throw new Error('Not authenticated or no organization context');
  }

  const { data, error } = await supabaseAdmin
    .from('workflow_templates')
    .insert([
      {
        organization_id: user.user_metadata.organization_id,
        name,
        stages,
        status: 'active',
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating workflow template:', error);
    throw new Error('Failed to create workflow template');
  }

  revalidatePath('/workflows');
  return data as WorkflowTemplate;
}
