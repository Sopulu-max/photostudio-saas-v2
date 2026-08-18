import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  getService, listServiceDomains, listServices, listServiceVariables,
  listDimensionsByDomain, listOutputTypesByDomain,
  buildDeliverableSuggestions, buildDimensionSuggestions, buildServiceSuggestions,
  buildVariableSuggestions,
} from '@/modules/services/interface';
import type { ServiceDimensionTag } from '@/modules/services/interface';
import { ServiceFieldsEditor } from '../ServiceFieldsEditor';
import { ServiceVariablesEditor } from '../ServiceVariablesEditor';

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

  const [domains, outputTypesByDomain, dimensionsByDomain, services, variables] = await Promise.all([
    listServiceDomains(), listOutputTypesByDomain(), listDimensionsByDomain(),
    listServices(), listServiceVariables(params.id),
  ]);

  // The same knowledge the create form gets — editing a service should narrow
  // exactly as defining one does.
  const serviceSuggestions = buildServiceSuggestions(services as any);
  const deliverableSuggestions = buildDeliverableSuggestions(services as any);
  const dimensionSuggestions = buildDimensionSuggestions(services as any);
  // What varies about work like this — the library's, plus what this studio's
  // own services already declare.
  const variableSuggestions = buildVariableSuggestions(services as any);

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
        serviceSuggestions={serviceSuggestions}
        deliverableSuggestions={deliverableSuggestions}
        dimensionSuggestions={dimensionSuggestions}
        outputTypesByDomain={outputTypesByDomain}
        dimensionsByDomain={dimensionsByDomain}
        initial={{
          name: service.name,
          description: (service as any).description,
          serviceDomain: (service as any).domain?.name || '',
          primaryDeliverable: (service as any).primary_deliverable?.name || null,
          deliverables: ((service as any).deliverables || []).map((d: any) => d.name),
          dimensions: (((service as any).dimensions || []) as ServiceDimensionTag[])
            .map((d) => ({ name: d.name, values: d.values.map((v) => v.name) })),
        }}
      />

      <div style={{ maxWidth: '800px', margin: '16px auto 0', width: '100%' }}>
        <ServiceVariablesEditor
          serviceId={service.id}
          initial={variables}
          suggestions={variableSuggestions}
          domainName={(service as any).domain?.name || ''}
          serviceName={service.name}
        />
      </div>
    </div>
  );
}
