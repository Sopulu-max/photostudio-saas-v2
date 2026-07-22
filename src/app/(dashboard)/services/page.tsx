import { supabaseAdmin } from '@/lib/supabase/admin';
import { ServiceTemplatesClient } from './client';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  let orgId: string;
  try {
    const auth = await getAuthOrgId();
    orgId = auth.orgId;
  } catch (error) {
    redirect('/login');
  }

  const { data: services } = await supabaseAdmin
        .from('service_templates')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

  return <ServiceTemplatesClient initialServices={services || []} />;
}
