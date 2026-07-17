'use server';

import { z } from 'zod';
import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { WorkflowTemplate, WorkflowStageDefinition } from '../types/engine';

const CreateWorkflowTemplateSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string(),
  stages: z.array(z.any()), // Would validate against WorkflowStageDefinition precisely
  actorId: z.string().uuid(),
});

export async function createWorkflowTemplate(input: z.infer<typeof CreateWorkflowTemplateSchema>) {
  const params = CreateWorkflowTemplateSchema.parse(input);
  
  const { data: template, error } = await supabaseAdmin
    .from('workflow_templates')
    .insert({
      organization_id: params.organizationId,
      name: params.name,
      stages: params.stages,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create workflow template:', error);
    throw new Error('Failed to create workflow template');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'workflow_template',
    entityId: template.id,
    action: 'created',
    actorId: params.actorId,
    payload: { name: params.name }
  });

  return template as WorkflowTemplate;
}

export async function getWorkflowTemplates(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from('workflow_templates')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch workflow templates:', error);
    return [];
  }

  return data as WorkflowTemplate[];
}
