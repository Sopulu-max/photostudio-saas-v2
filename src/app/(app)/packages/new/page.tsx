import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listActiveServices } from '@/modules/services/interface';
import { listRoles } from '@/modules/team/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { PackageFieldsEditor } from '../[id]/PackageFieldsEditor';

export const dynamic = 'force-dynamic';

/**
 * `?value=` arrives from the classification view: entering at Birthday and choosing to package
 * what the studio already does should not drop you into a blank form and make
 * you re-say Birthday. The value is preselected; everything else is the same
 * builder.
 */
export default async function NewPackagePage(props: { searchParams: Promise<{ value?: string }> }) {
  const sp = await props.searchParams;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const { listDimensionsByDomain, listVariablesForServices, listVariablesForDimensions } = await import('@/modules/services/interface');
  const { listDeliverables } = await import('@/modules/deliverables/interface');
  const [allServices, roles, currencyCode, allDeliverables, dimensionsByDomain] = await Promise.all([
    listActiveServices(), listRoles(), getStudioCurrency(), listDeliverables(), 
    listDimensionsByDomain(),
  ]);

  const allVariables = await listVariablesForServices((allServices as any[]).map(s => s.id));
  /*
   * And what the studio's questions say follows from their answers.
   *
   * An Occasion has a date. Every dimension the studio asks contributes its
   * variables here, so a package classified by Occasion can fix that date or
   * leave it to the client, exactly as it does with a service's own variables.
   * Loaded for every dimension rather than only the ones in play: which
   * dimensions apply depends on what the operator bundles, and that changes
   * while the form is open.
   */
  const dimensionVariables = await listVariablesForDimensions(
    Object.values(dimensionsByDomain).flat().map((d: any) => d.id),
  );


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
        allVariables={[...allVariables, ...dimensionVariables] as any}
        allDeliverables={allDeliverables as any}
        dimensionsByDomain={dimensionsByDomain}
        roleOptions={(roles as any[]).map((r) => r.name)}
        // Arrived from the classifications lens — "build a package for Weddings".
        // It cannot become a narrowing until a service is chosen to narrow, so it
        // is carried as intent and applied to the first service that speaks it.
        intendedValueIds={sp.value ? [String(sp.value)] : []}
        initial={{
            // Shown from the start: undefined would mean this form is not
            // allowed to speak for the cover at all.
            coverUrl: null, variableValues: [] }}
      />
    </div>
  );
}

