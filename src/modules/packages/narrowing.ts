import { supabaseAdmin } from '@/lib/supabase/admin';
import { narrowingFrom, type Answer, type Narrowing } from '@/kernel/classification';
import { structureIdOf } from './familyInternal';

/**
 * What a package narrows itself to, as the kernel reads it - per dimension,
 * the values it allows. Bookings asks this of the packages on a booking to
 * say whether what the client asked for is answered by what is on it: the
 * same set test (`admits`) that decides what may be offered, run the other
 * way round. A plain module: it takes the organization as a parameter.
 */
export async function packageNarrowingsFor(orgId: string, packageIds: string[]): Promise<Map<string, Narrowing>> {
  const out = new Map<string, Narrowing>();
  for (const packageId of [...new Set(packageIds)]) {
    const { data } = await supabaseAdmin
      .from('packages')
      .select('id, package_services(package_service_dimension_values(dimension_value:dimension_values(id, dimension_id)))')
      .eq('organization_id', orgId)
      .eq('id', await structureIdOf(orgId, packageId))
      .maybeSingle();
    const rows: Answer[] = (((data as any)?.package_services || []) as any[])
      .flatMap((ps) => ((ps.package_service_dimension_values || []) as any[])
        .map((l) => ({ dimensionId: l?.dimension_value?.dimension_id as string, valueId: l?.dimension_value?.id as string }))
        .filter((r) => r.dimensionId && r.valueId));
    out.set(packageId, narrowingFrom(rows));
  }
  return out;
}
