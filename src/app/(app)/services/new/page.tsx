import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  listServiceDomains, listServices,
  listDimensionsByDomain,
  buildDeliverableSuggestions, buildDimensionSuggestions, buildServiceSuggestions,
  buildVariableSuggestions,
  listWorkflowsByDomain,
} from '@/modules/services/interface';
import { listOutputTypesByDomain } from '@/modules/deliverables/interface';
import { listRoles } from '@/modules/team/interface';
import { TemplatePicker } from './TemplatePicker';

export const dynamic = 'force-dynamic';

/**
 * `?domain=&dimension=&value=` arrives from the classification view: deciding that Birthday is
 * a genuinely different process should carry Birthday into the new service,
 * not make you say it again. It also skips the template gallery — the decision
 * that got you here was already "none of these".
 */
export default async function NewServicePage(props: {
  searchParams: Promise<{ domain?: string; dimension?: string; value?: string }>
}) {
  const sp = await props.searchParams;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [domains, outputTypesByDomain, dimensionsByDomain, workflowsByDomain, services, roles] = await Promise.all([
    listServiceDomains(), listOutputTypesByDomain(), listDimensionsByDomain(), listWorkflowsByDomain(), listServices(), listRoles()
  ]);

  // The knowledge the form arrives with. Built from the curated library plus
  // what this studio has actually defined, and narrowed at each step: a domain
  // knows its services, a service knows its own dimensions and outputs.
  const serviceSuggestions = buildServiceSuggestions(services as any);
  const deliverableSuggestions = buildDeliverableSuggestions(services as any);
  const dimensionSuggestions = buildDimensionSuggestions(services as any);
  const variableSuggestions = buildVariableSuggestions(services as any);
  const roleOptions = (roles as any[]).map(r => r.name);

  return (
    <TemplatePicker
      startFrom={sp.domain || sp.value ? {
        serviceDomain: sp.domain || '',
        dimensions: sp.dimension && sp.value ? [{ name: sp.dimension, values: [sp.value] }] : [],
      } : undefined}
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
    />
  );
}
