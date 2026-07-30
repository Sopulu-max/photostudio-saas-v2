import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listServices, listBlueprints } from '@/modules/services/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { ServiceTemplatesClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  // Through the module's interface — the page never touches its tables.
  const [services, blueprints, currencyCode] = await Promise.all([listServices(), listBlueprints(), getStudioCurrency()]);

  return <ServiceTemplatesClient initialServices={services} blueprints={blueprints} currencyCode={currencyCode} />;
}
