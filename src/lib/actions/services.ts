'use server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { ServiceTemplate } from '../types/engine';

export async function getServiceTemplates(): Promise<ServiceTemplate[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.user_metadata?.organization_id) {
    throw new Error('Not authenticated or no organization context');
  }

  const { data, error } = await supabase
    .from('service_templates')
    .select('*')
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.user_metadata?.organization_id) {
    throw new Error('Not authenticated or no organization context');
  }

  const { data, error } = await supabaseAdmin
    .from('service_templates')
    .insert([
      {
        organization_id: user.user_metadata.organization_id,
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
