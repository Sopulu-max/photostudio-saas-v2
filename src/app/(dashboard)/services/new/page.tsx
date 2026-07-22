import { supabaseAdmin } from '@/lib/supabase/admin';
import { NewServiceForm } from './form';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NewServicePage() {
  let orgId: string;
  try {
    const auth = await getAuthOrgId();
    orgId = auth.orgId;
  } catch (error) {
    redirect('/login');
  }

  const { data: workflows } = await supabaseAdmin
        .from('workflow_templates')
        .select('*')
        .eq('organization_id', orgId)
        .order('name', { ascending: true });

  return <NewServiceForm workflowTemplates={workflows || []} />;
}
