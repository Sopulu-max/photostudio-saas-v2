import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listBlueprints, getServiceDefaults } from '@/modules/services/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { NewServiceForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewServicePage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [blueprints, currencyCode, defaults] = await Promise.all([
    listBlueprints(), getStudioCurrency(), getServiceDefaults(),
  ]);

  return (
    <NewServiceForm
      workflowTemplates={blueprints}
      currencyCode={currencyCode}
      defaultPaymentPolicy={defaults.paymentPolicy}
      defaultDepositPercentage={defaults.depositPercentage}
    />
  );
}
