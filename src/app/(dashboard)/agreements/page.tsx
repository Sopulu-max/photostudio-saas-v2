import { supabaseAdmin } from '@/lib/supabase/admin';
import { AgreementsClient } from './client';

export default async function AgreementsPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  const { data: agreements } = org
    ? await supabaseAdmin
        .from('agreements')
        .select('*, person:persons(display_name)')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  return <AgreementsClient initialAgreements={agreements || []} />;
}
