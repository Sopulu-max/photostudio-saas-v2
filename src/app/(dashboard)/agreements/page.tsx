import { supabaseAdmin } from '@/lib/supabase/admin';
import { AgreementsClient } from './client';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

export default async function AgreementsPage() {
  const { orgId } = await getAuthOrgId();

  const { data: agreements } = await supabaseAdmin
        .from('agreements')
        .select('*, person:persons(display_name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

  return <AgreementsClient initialAgreements={agreements || []} />;
}
