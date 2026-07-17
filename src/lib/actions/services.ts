'use server';

import { supabaseAdmin } from '../supabase/admin';
import { logEvent } from './events';
import type { ServiceTemplate, WorkflowStageDefinition } from '../types/engine';

export async function createServiceTemplate(params: {
  organizationId: string;
  name: string;
  defaultWorkflowTemplateId: string | null;
  pricing: ServiceTemplate['pricing'];
  actorId: string;
}) {
  const { data: template, error } = await supabaseAdmin
    .from('service_templates')
    .insert({
      organization_id: params.organizationId,
      name: params.name,
      default_workflow_template_id: params.defaultWorkflowTemplateId,
      pricing: params.pricing,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create service template:', error);
    throw new Error('Failed to create service template');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'service_template',
    entityId: template.id,
    action: 'created',
    actorId: params.actorId,
    payload: { name: params.name }
  });

  return template as ServiceTemplate;
}

export async function getServiceTemplates(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from('service_templates')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch service templates:', error);
    return [];
  }

  return data as ServiceTemplate[];
}
