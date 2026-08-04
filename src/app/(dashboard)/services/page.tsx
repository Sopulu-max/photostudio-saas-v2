import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { listServices, listCategories } from '@/modules/services/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { ServiceTemplatesClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  let orgId: string;
  try {
    orgId = (await getAuthOrgId()).orgId;
  } catch {
    redirect('/login');
  }

  // Through the module's interface — the page never touches its tables.
  const [services, categories, currencyCode, org] = await Promise.all([
    listServices(), listCategories(), getStudioCurrency(),
    supabaseAdmin.from('organizations').select('slug').eq('id', orgId).single().then((r: any) => r.data),
  ]);

  return (
    <ServiceTemplatesClient
      initialServices={services}
      categories={categories}
      currencyCode={currencyCode}
      storefrontSlug={org?.slug ?? null}
    />
  );
}
