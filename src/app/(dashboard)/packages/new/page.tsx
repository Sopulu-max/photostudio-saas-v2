import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listActiveServices } from '@/modules/services/interface';
import { listRoles } from '@/modules/team/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { PackageFieldsEditor } from '../[id]/PackageFieldsEditor';

export const dynamic = 'force-dynamic';

export default async function NewPackagePage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const { listDeliverables } = await import('@/modules/services/interface');
  const [allServices, roles, currencyCode, allDeliverables] = await Promise.all([
    listActiveServices(), listRoles(), getStudioCurrency(), listDeliverables()
  ]);

  const suggestedDeliverablesByService: Record<string, string[]> = {};
  for (const s of (allServices as any[])) {
    suggestedDeliverablesByService[s.id] = (s.deliverables || []).map((d: any) => d.id);
  }

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Build a package</h1>
          <p className="q-page-subtitle">Bundle one or more services into something a client can buy.</p>
        </div>
      </header>
      <PackageFieldsEditor
        mode="create"
        currencyCode={currencyCode}
        allServices={allServices as any}
        allDeliverables={allDeliverables as any}
        suggestedDeliverablesByService={suggestedDeliverablesByService}
        roleOptions={(roles as any[]).map((r) => r.name)}
        initial={{}}
      />
    </div>
  );
}
