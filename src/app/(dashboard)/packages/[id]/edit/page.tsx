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

  const { listDeliverables, listDeliveryContainers, listBlueprints, listDimensionsByDomain, listVariablesForServices } = await import('@/modules/services/interface');
  const [allServices, roles, currencyCode, questions, lockedIds, allDeliverables, allContainers, allWorkflows, dimensionsByDomain] = await Promise.all([
    listActiveServices(), listRoles(), getStudioCurrency(),
    getIntakeQuestions(params.id), getLockedQuestionIds(params.id), listDeliverables(), listDeliveryContainers(), listBlueprints(),
    listDimensionsByDomain(),
  ]);

  const suggestedDeliverablesByService: Record<string, string[]> = {};
  for (const s of (allServices as any[])) {
    suggestedDeliverablesByService[s.id] = (s.deliverables || []).map((d: any) => d.id);
  }

  // Only the variables of the services this package actually bundles — the
  // editor cannot offer anything the package has no right to fix.
  const bundledServices = ((pkg as any).services || []) as { id: string; name: string }[];
  const serviceNameById = new Map(bundledServices.map((s) => [s.id, s.name]));
  const bundledVariables = (await listVariablesForServices(bundledServices.map((s) => s.id)))
    .map((v: any) => ({ ...v, serviceName: serviceNameById.get(v.serviceId) || 'Service' }));

  const pricing: any = pkg.pricing || {};
  const hasPrice = pricing.base_price != null;
  const basePrice = Number(pricing.base_price || 0);
  const paymentPolicy = pkg.payment_policy as 'deposit' | 'full' | null;
  const depositPct = paymentPolicy === 'full' ? 100 : Number(pricing.deposit_percentage || 0);
  const variant = pkg.pricing_variant as { axis_label: string; tiers: { label: string; price: number }[] } | null;

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
          allDeliverables={allDeliverables as any}
          allContainers={allContainers as any}
          allWorkflows={allWorkflows as any}
          suggestedDeliverablesByService={suggestedDeliverablesByService}
          dimensionsByDomain={dimensionsByDomain}
          roleOptions={(roles as any[]).map((r) => r.name)}
          initial={{
            name: pkg.name,
            description: (pkg as any).description,
            basePrice: hasPrice ? basePrice : null,
            priceUnit: (pkg as any).price_unit,
            paymentPolicy,
            depositPercentage: depositPct,
            durationMinutes: (pkg as any).duration_minutes,
            serviceIds: ((pkg as any).services || []).map((s: any) => s.id),
            deliverableIds: ((pkg as any).deliverables || []).map((d: any) => d.id),
            deliverableSpecs: Object.fromEntries(((pkg as any).deliverables || []).map((d: any) =>
              [d.id, { quantity: d.quantity, unit: d.unit, spec: d.spec }])),
            containerIds: ((pkg as any).containers || []).map((d: any) => d.id),
            workflowIds: ((pkg as any).workflows || []).map((d: any) => d.id),
            dimensionValueIds: (((pkg as any).dimensions || []) as { values: { id: string }[] }[])
              .flatMap((d) => d.values.map((v) => v.id)),
            pricingVariant: variant ? { axisLabel: variant.axis_label, tiers: variant.tiers } : null,
            extraStages: ((pkg as any).extra_stages || []).map((s: any) => ({ name: s.name, roleName: s.roleName || '', frontStage: s.front_stage ?? true })),
          }}
        />

        <PackageVariablesEditor
          packageId={pkg.id}
          variables={bundledVariables as any}
          initial={((pkg as any).variableValues || []).map((v: any) => ({ serviceVariableId: v.serviceVariableId, value: v.value }))}
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
