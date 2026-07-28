import { supabaseAdmin } from '@/lib/supabase/admin';
import { ContractsClient } from './client';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const { orgId } = await getAuthOrgId();

  const { data: contracts } = await supabaseAdmin
        .from('contracts')
        .select('*, person:contacts(display_name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

  return <ContractsClient initialContracts={contracts || []} />;
}
