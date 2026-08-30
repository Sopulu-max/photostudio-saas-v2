import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getPackage, getIntakeQuestions, getLockedQuestionIds } from '@/modules/packages/interface';
import { listActiveServices } from '@/modules/services/interface';
import { listRoles } from '@/modules/team/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { PackageFieldsEditor } from '../PackageFieldsEditor';
import { PackageVariablesEditor } from '../PackageVariablesEditor';

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
          {/*
            * The thing, then what you are doing to it — not the other way round.
            *
            * This read "Edit Studio Portrait Photography", which makes the
            * largest text on the page a verb phrase about the operator rather
            * than the name of what they opened. Every other page in the app
            * titles itself with the thing it is about, and a long name turned
            * this one into a sentence fragment that wrapped.
            *
            * The editing is said three times over already: by the back link,
            * by the Save button, and by every field on the page being a field.
            * It does not need to be said in the largest type as well.
            */}
          <span className="q-eyebrow">Editing</span>
          <h1 className="q-page-title">{pkg.name}</h1>
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
          // Edited inside the one form now, rather than by a second editor below
          // its Save button that saved them separately.
          questions={questions}
          lockedQuestionIds={lockedIds}
          initial={{
            name: pkg.name,
            description: (pkg as any).description,
            // Already normalised to { amount, currency } by the module, which is
            // the only shape any screen should see. Omitting it here is what
            // opened every package with an empty price box.
            price: (pkg as any).price,
            coverUrl: (pkg as any).cover_url ?? null,
            coverPosition: (pkg as any).cover_position ?? null,
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
            variableValues: ((pkg as any).variableValues || []).map((v: any) => ({
              serviceVariableId: v.serviceVariableId,
              value: v.value,
              // Which of the two classes it is in, so the form opens showing the
              // decision rather than inferring one from an empty box.
              answeredBy: v.answeredBy,
            })),
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
      </div>
    </div>
  );
}
