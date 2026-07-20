import { supabaseAdmin } from '@/lib/supabase/admin';
import { NewServiceForm } from './form';

export default async function NewServicePage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  const { data: workflows } = org 
    ? await supabaseAdmin
        .from('workflow_templates')
        .select('*')
        .eq('organization_id', org.id)
        .order('name', { ascending: true })
    : { data: [] };

  return <NewServiceForm workflowTemplates={workflows || []} />;
}
