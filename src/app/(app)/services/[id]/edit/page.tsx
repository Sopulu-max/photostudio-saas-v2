import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  getService, listServiceDomains, listServices, listServiceVariables,
  listDimensionsByDomain,
  listWorkflowsByDomain,
  buildDeliverableSuggestions, buildDimensionSuggestions, buildServiceSuggestions,
  buildVariableSuggestions,
} from '@/modules/services/interface';
import { listOutputTypesByDomain } from '@/modules/deliverables/interface';
import { listRoles } from '@/modules/team/interface';
import type { ServiceDimensionTag } from '@/modules/services/interface';
import { ServiceFieldsEditor } from '../ServiceFieldsEditor';

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

  const [domains, outputTypesByDomain, dimensionsByDomain, workflowsByDomain, services, variables, roles] = await Promise.all([
    listServiceDomains(), listOutputTypesByDomain(), listDimensionsByDomain(), listWorkflowsByDomain(),
    listServices(), listServiceVariables(params.id), listRoles()
  ]);

  // The same knowledge the create form gets — editing a service should narrow
  // exactly as defining one does.
  const serviceSuggestions = buildServiceSuggestions(services as any);
  const deliverableSuggestions = buildDeliverableSuggestions(services as any);
  const dimensionSuggestions = buildDimensionSuggestions(services as any);
  // What varies about work like this — the library's, plus what this studio's
  const variableSuggestions = buildVariableSuggestions(services as any);
  const roleOptions = (roles as any[]).map(r => r.name);

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href={`/services/${service.id}`}>&larr; Back to Service</Link>
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
          <h1 className="q-page-title">{service.name}</h1>
        </div>
      </header>

      <ServiceFieldsEditor
        mode="edit"
        serviceId={service.id}
        status={service.status}
        domains={domains}
        domainOptions={domains.map((d: any) => d.name)}
        serviceSuggestions={serviceSuggestions}
        deliverableSuggestions={deliverableSuggestions}
        dimensionSuggestions={dimensionSuggestions}
        variableSuggestions={variableSuggestions}
        outputTypesByDomain={outputTypesByDomain}
        dimensionsByDomain={dimensionsByDomain}
        workflowsByDomain={workflowsByDomain}
        roleOptions={roleOptions}
        initial={{
          name: service.name,
          description: (service as any).description,
          /*
           * Passed even when null, so the editor knows it HOLDS the cover and
           * may speak for it. Omitting it leaves coverUrl undefined, which the
           * editor reads as "not this form's to touch" — the same rule that
           * kept a form which was never given the workflow from deleting it.
           */
          coverUrl: (service as any).cover_url ?? null,
          coverPosition: (service as any).cover_position ?? null,
          serviceDomain: (service as any).domain?.name || '',
          primaryDeliverable: (service as any).primary_deliverable?.name || null,
          deliverables: ((service as any).deliverables || []).map((d: any) => d.name),
          dimensions: (((service as any).dimensions || []) as ServiceDimensionTag[])
            .map((d) => ({ name: d.name, values: d.values.map((v) => v.name) })),
          /*
           * The workflow, which this form was never given.
           *
           * Without it the editor opened on null, and since it sends whatever
           * it holds, saving wrote workflow_id = null. So editing a service for
           * any reason — renaming it, adding a deliverable — silently deleted
           * its workflow, and with it every task that would have flowed onto a
           * booking. getService has always returned this in exactly the shape
           * the editor wants; nothing was passing it across.
           */
          workflow: (service as any).workflow ?? null,
          // Now edited inside the one form rather than by a second editor
          // below its Save button.
          variables,
        }}
      />

    </div>
  );
}
