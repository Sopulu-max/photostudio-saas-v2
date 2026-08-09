import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  getService, listServiceDomains, listDeliverables, listServices,
  getEnabledDimensions, listOccasions, listContexts, listSubjects, listPurposes, listClientTypes,
  buildDeliverableSuggestions, buildDimensionSuggestions,
} from '@/modules/services/interface';
import type { Dimension } from '@/modules/services/interface';
import { ServiceFieldsEditor } from '../ServiceFieldsEditor';
import { DimensionTag } from '../../DimensionTag';

export const dynamic = 'force-dynamic';

export default async function ServiceEditPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const service = await getService(params.id);
  if (!service) notFound();

  const [domains, deliverables, enabledDimensions, occasions, contexts, subjects, purposes, clientTypes, services] = await Promise.all([
    listServiceDomains(), listDeliverables(),
    getEnabledDimensions(), listOccasions(), listContexts(), listSubjects(), listPurposes(), listClientTypes(),
    listServices(),
  ]);

  const dims = service as any;
  const tags: [Dimension, { id: string; name: string } | null][] = [
    ['subject', dims.subject], ['occasion', dims.occasion], ['context', dims.context],
    ['purpose', dims.purpose], ['client', dims.client_type],
  ];

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href={`/services/${service.id}`}>&larr; Back to Service</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Edit {service.name}</h1>
        </div>
      </header>

      <ServiceFieldsEditor
        mode="edit"
        serviceId={service.id}
        status={service.status}
        domainOptions={domains.map((d: any) => d.name)}
        outputOptions={deliverables.map((d: any) => d.name)}
        enabledDimensions={enabledDimensions}
        occasionOptions={occasions.map((o: any) => o.name)}
        contextOptions={contexts.map((c: any) => c.name)}
        subjectOptions={subjects.map((s: any) => s.name)}
        purposeOptions={purposes.map((p: any) => p.name)}
        clientTypeOptions={clientTypes.map((c: any) => c.name)}
        outputSuggestionsByDomain={buildDeliverableSuggestions(services)}
        dimensionSuggestionsByDomain={buildDimensionSuggestions(services)}
        initial={{
          name: service.name,
          description: (service as any).description,
          serviceDomain: (service as any).domain?.name || '',
          requiredInputDeliverable: (service as any).required_input_type?.name || null,
          primaryDeliverable: (service as any).primary_output_type?.name || null,
          deliverables: ((service as any).deliverables || []).map((d: any) => d.name),
          occasions: ((service as any).occasions || []).map((d: any) => d.name),
          contexts: ((service as any).contexts || []).map((d: any) => d.name),
          subjects: ((service as any).subjects || []).map((d: any) => d.name),
          purposes: ((service as any).purposes || []).map((d: any) => d.name),
          clientTypes: ((service as any).clientTypes || []).map((d: any) => d.name),
        }}
      />
    </div>
  );
}
