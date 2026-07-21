'use server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { ServiceTemplate } from '../types/engine';

import { getAuthOrgId } from '../supabase/getOrgId';

export async function getServiceTemplates(): Promise<ServiceTemplate[]> {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('service_templates')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching service templates:', error);
    throw new Error('Failed to fetch service templates');
  }

  return data as ServiceTemplate[];
}

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
