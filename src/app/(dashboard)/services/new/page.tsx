import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listBlueprints } from '@/modules/services/interface';
import { NewServiceForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewServicePage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const blueprints = await listBlueprints();

  return <NewServiceForm workflowTemplates={blueprints} />;
}
