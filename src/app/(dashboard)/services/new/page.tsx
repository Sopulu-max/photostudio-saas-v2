import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  listBlueprints, listServiceDomains, listDeliverables, listServices,
  getEnabledDimensions, listOccasions, listContexts, listSubjects, listPurposes, listClientTypes,
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

  const [domains, deliverables, enabledDimensions, occasions, contexts, subjects, purposes, clientTypes, services] = await Promise.all([
    listServiceDomains(), listDeliverables(),
    getEnabledDimensions(), listOccasions(), listContexts(), listSubjects(), listPurposes(), listClientTypes(),
    listServices(),
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
      outputOptions={deliverables.map((d: any) => d.name)}
      enabledDimensions={enabledDimensions}
      occasionOptions={occasions.map((o: any) => o.name)}
      contextOptions={contexts.map((c: any) => c.name)}
      subjectOptions={subjects.map((s: any) => s.name)}
      purposeOptions={purposes.map((p: any) => p.name)}
      clientTypeOptions={clientTypes.map((c: any) => c.name)}
    />
  );
}
