import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import {
  listBlueprints, listServiceDomains, listDeliverables, listServices,
  getEnabledDimensions, listOccasions, listContexts, listSubjects, listPurposes, listClientTypes,
  buildDeliverableSuggestions, buildDimensionSuggestions,
} from '@/modules/services/interface';
import { TemplatePicker } from './TemplatePicker';

export const dynamic = 'force-dynamic';

export default async function NewServicePage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [blueprints, domains, deliverables, enabledDimensions, occasions, contexts, subjects, purposes, clientTypes, services] = await Promise.all([
    listBlueprints(), listServiceDomains(), listDeliverables(),
    getEnabledDimensions(), listOccasions(), listContexts(), listSubjects(), listPurposes(), listClientTypes(),
    listServices(),
  ]);

  return (
    <TemplatePicker
      blueprints={blueprints}
      domainOptions={domains.map((d: any) => d.name)}
      deliverableOptions={deliverables.map((d: any) => d.name)}
      enabledDimensions={enabledDimensions}
      occasionOptions={occasions.map((o: any) => o.name)}
      contextOptions={contexts.map((c: any) => c.name)}
      subjectOptions={subjects.map((s: any) => s.name)}
      purposeOptions={purposes.map((p: any) => p.name)}
      clientTypeOptions={clientTypes.map((c: any) => c.name)}
      deliverableSuggestionsByDomain={buildDeliverableSuggestions(services)}
      dimensionSuggestionsByDomain={buildDimensionSuggestions(services)}
    />
  );
}
