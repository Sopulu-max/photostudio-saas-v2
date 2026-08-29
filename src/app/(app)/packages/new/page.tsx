import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listActiveServices } from '@/modules/services/interface';
import { listRoles } from '@/modules/team/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { PackageFieldsEditor } from '../[id]/PackageFieldsEditor';

export const dynamic = 'force-dynamic';

/**
 * Arriving with the answer already half given.
 *
 * `?value=` comes from the classification view: entering at Birthday and
 * choosing to package what the studio already does should not drop you into a
 * blank form and make you re-say Birthday.
 *
 * `?values=` comes from a service's own classifications, where a COMBINATION was
 * chosen — Studio, Maternity — and `?name=` carries what that combination is
 * called. A service classified across four occasions and two contexts covers
 * eight sellable things; naming one and pressing create is the shortest path
 * from "we do this" to "a client can buy this", and it should not begin with an
 * empty form.
 */
export default async function NewPackagePage(props: {
  searchParams: Promise<{ value?: string; values?: string; name?: string }>;
}) {
  const sp = await props.searchParams;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const { listDimensionsByDomain, listVariablesForServices } = await import('@/modules/services/interface');
  const { listDeliverables } = await import('@/modules/deliverables/interface');
  const [allServices, roles, currencyCode, allDeliverables, dimensionsByDomain] = await Promise.all([
    listActiveServices(), listRoles(), getStudioCurrency(), listDeliverables(), 
    listDimensionsByDomain(),
  ]);

  const allVariables = await listVariablesForServices((allServices as any[]).map(s => s.id));

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
        allVariables={allVariables as any}
        allDeliverables={allDeliverables as any}
        dimensionsByDomain={dimensionsByDomain}
        roleOptions={(roles as any[]).map((r) => r.name)}
        // Arrived from the classifications lens — "build a package for Weddings".
        // It cannot become a narrowing until a service is chosen to narrow, so it
        // is carried as intent and applied to the first service that speaks it.
        intendedValueIds={
          sp.values
            ? String(sp.values).split(',').map((v) => v.trim()).filter(Boolean)
            : sp.value ? [String(sp.value)] : []
        }
        initial={{ variableValues: [], name: sp.name ? String(sp.name) : undefined }}
      />
    </div>
  );
}

