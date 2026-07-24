'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { ServiceTemplate } from '../types/engine';

import { getAuthOrgId } from '../supabase/getOrgId';

export async function createServiceTemplate(
  name: string,
  defaultWorkflowTemplateId: string | null,
  pricing: any,
  formSchema: any[] = []
): Promise<ServiceTemplate> {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('service_templates')
    .insert([
      {
        organization_id: orgId,
        name,
        default_workflow_template_id: defaultWorkflowTemplateId,
        pricing,
        resource_requirements: {},
        role_requirements: {},
        deliverable_spec: {},
        form_schema: formSchema,
        status: 'active',
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating service template:', error);
    throw new Error('Failed to create service template');
  }

  revalidatePath('/services');
  return data as ServiceTemplate;
}
