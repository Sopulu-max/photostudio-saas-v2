import { supabaseAdmin } from '@/lib/supabase/admin';
import { ServiceTemplatesClient } from './client';

export default async function ServicesPage() {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
  const org = orgs?.[0];

  const { data: services } = org 
    ? await supabaseAdmin
        .from('service_templates')
        .select('*')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  return <ServiceTemplatesClient initialServices={services || []} />;
}
