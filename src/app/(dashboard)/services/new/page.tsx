import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  listBlueprints, listServiceDomains, listServices,
  listDimensionsByDomain, listOutputTypesByDomain,
  buildDeliverableSuggestions, buildDimensionSuggestions, buildServiceSuggestions,
} from '@/modules/services/interface';
import { TemplatePicker } from './TemplatePicker';

export const dynamic = 'force-dynamic';

export default async function NewServicePage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [domains, outputTypesByDomain, dimensionsByDomain, services] = await Promise.all([
    listServiceDomains(), listOutputTypesByDomain(), listDimensionsByDomain(), listServices(),
  ]);

  // The knowledge the form arrives with. Built from the curated library plus
  // what this studio has actually defined, and narrowed at each step: a domain
  // knows its services, a service knows its own dimensions and outputs.
  const serviceSuggestions = buildServiceSuggestions(services as any);
  const deliverableSuggestions = buildDeliverableSuggestions(services as any);
  const dimensionSuggestions = buildDimensionSuggestions(services as any);

  return (
    <TemplatePicker
      domainOptions={domains.map((d: any) => d.name)}
      serviceSuggestions={serviceSuggestions}
      deliverableSuggestions={deliverableSuggestions}
      dimensionSuggestions={dimensionSuggestions}
      outputTypesByDomain={outputTypesByDomain}
      dimensionsByDomain={dimensionsByDomain}
    />
  );
}
