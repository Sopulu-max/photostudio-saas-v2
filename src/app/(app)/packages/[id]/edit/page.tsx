import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getPackage, getIntakeQuestions, getLockedQuestionIds } from '@/modules/packages/interface';
import { listActiveServices } from '@/modules/services/interface';
import { listRoles } from '@/modules/team/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { PackageFieldsEditor } from '../PackageFieldsEditor';
import { PackageVariablesEditor } from '../PackageVariablesEditor';
import { QuestionEditor } from '../QuestionEditor';

export const dynamic = 'force-dynamic';

export default async function PackageEditPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const pkg = await getPackage(params.id);
  if (!pkg) notFound();

  const { listDimensionsByDomain, listVariablesForServices } = await import('@/modules/services/interface');
  const { listDeliverables } = await import('@/modules/deliverables/interface');
  const [allServices, roles, currencyCode, questions, lockedIds, allDeliverables, dimensionsByDomain] = await Promise.all([
    listActiveServices(), listRoles(), getStudioCurrency(),
    getIntakeQuestions(params.id), getLockedQuestionIds(params.id), listDeliverables(),
    listDimensionsByDomain(),
  ]);

  const allVariables = (await listVariablesForServices(allServices.map((s: any) => s.id)))
    .map((v: any) => {
      const sName = (allServices as any[]).find(s => s.id === v.serviceId)?.name || 'Service';
      return { ...v, serviceName: sName };
    });

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href={`/packages/${pkg.id}`}>&larr; Back to Package</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Edit {pkg.name}</h1>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <PackageFieldsEditor
          mode="edit"
          packageId={pkg.id}
          status={pkg.status}
          currencyCode={currencyCode}
          allServices={allServices as any}
          allVariables={allVariables as any}
          allDeliverables={allDeliverables as any}
          dimensionsByDomain={dimensionsByDomain}
          roleOptions={(roles as any[]).map((r) => r.name)}
          initial={{
            name: pkg.name,
            description: (pkg as any).description,
            durationMinutes: (pkg as any).duration_minutes,
            serviceIds: ((pkg as any).services || []).map((s: any) => s.id),
            // Read back off each bundled service, which is where they are held.
            deliverables: (((pkg as any).services || []) as any[]).flatMap((s) =>
              ((s.deliverables || []) as any[]).map((d) => ({
                serviceId: s.id as string, deliverableId: d.id as string,
                quantity: d.quantity ?? null, unit: d.unit ?? null, spec: d.spec ?? null, specValues: d.spec_values ?? null,
              }))),
            narrowings: (((pkg as any).services || []) as any[]).flatMap((s) =>
              ((s.narrowedTo || []) as { values: { id: string }[] }[])
                .flatMap((d) => d.values.map((v) => ({ serviceId: s.id as string, valueId: v.id })))),
            extraStages: ((pkg as any).extra_stages || []).map((s: any) => ({ name: s.name, roleName: s.roleName || '', frontStage: s.front_stage ?? true })),
            variableValues: ((pkg as any).variableValues || []).map((v: any) => ({ serviceVariableId: v.serviceVariableId, value: v.value })),
            tasks: (((pkg as any).services || []) as any[]).flatMap((s) =>
              ((s.tasks || []) as any[]).map((t) => ({
                serviceId: s.id as string,
                taskId: t.id as string,
                workflowTaskId: t.workflowTaskId as string,
                name: t.name as string,
                roleId: t.roleId as string | null,
                roleName: t.roleName as string | null,
                isActive: t.isActive as boolean,
              }))
            ),
            services: (pkg as any).services,
          }}
        />

        <div className="q-card q-section">
          <h2 className="q-section-title">Intake questions</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>What a client is asked when they book this online.</p>
          <QuestionEditor packageId={pkg.id} questions={questions} lockedIds={lockedIds} services={pkg.services as any} />
        </div>
      </div>
    </div>
  );
}
