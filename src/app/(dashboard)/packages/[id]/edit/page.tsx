import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getPackage, getIntakeQuestions, getLockedQuestionIds } from '@/modules/packages/interface';
import { listActiveServices } from '@/modules/services/interface';
import { listRoles } from '@/modules/team/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { PackageFieldsEditor } from '../PackageFieldsEditor';
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

  const { listDeliverables, listDeliveryContainers, listBlueprints, getEnabledDimensions, listOccasions, listContexts, listSubjects, listPurposes, listClientTypes } = await import('@/modules/services/interface');
  const [allServices, roles, currencyCode, questions, lockedIds, allDeliverables, allContainers, allWorkflows, enabledDimensions, occasions, contexts, subjects, purposes, clientTypes] = await Promise.all([
    listActiveServices(), listRoles(), getStudioCurrency(),
    getIntakeQuestions(params.id), getLockedQuestionIds(params.id), listDeliverables(), listDeliveryContainers(), listBlueprints(),
    getEnabledDimensions(), listOccasions(), listContexts(), listSubjects(), listPurposes(), listClientTypes()
  ]);

  const suggestedDeliverablesByService: Record<string, string[]> = {};
  for (const s of (allServices as any[])) {
    suggestedDeliverablesByService[s.id] = (s.deliverables || []).map((d: any) => d.id);
  }

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
          enabledDimensions={enabledDimensions}
          occasionOptions={occasions.map((o: any) => ({ id: o.id, name: o.name }))}
          contextOptions={contexts.map((c: any) => ({ id: c.id, name: c.name }))}
          subjectOptions={subjects.map((s: any) => ({ id: s.id, name: s.name }))}
          purposeOptions={purposes.map((p: any) => ({ id: p.id, name: p.name }))}
          clientTypeOptions={clientTypes.map((c: any) => ({ id: c.id, name: c.name }))}
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
            containerIds: ((pkg as any).containers || []).map((d: any) => d.id),
            workflowIds: ((pkg as any).workflows || []).map((d: any) => d.id),
            occasions: ((pkg as any).occasions || []).map((d: any) => d.id),
            contexts: ((pkg as any).contexts || []).map((d: any) => d.id),
            subjects: ((pkg as any).subjects || []).map((d: any) => d.id),
            purposes: ((pkg as any).purposes || []).map((d: any) => d.id),
            clientTypes: ((pkg as any).clientTypes || []).map((d: any) => d.id),
            pricingVariant: variant ? { axisLabel: variant.axis_label, tiers: variant.tiers } : null,
            extraStages: ((pkg as any).extra_stages || []).map((s: any) => ({ name: s.name, roleName: s.roleName || '', frontStage: s.front_stage ?? true })),
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
