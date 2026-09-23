import { supabaseAdmin } from '@/lib/supabase/admin';
import { narrowingFrom, type Answer, type Narrowing } from '@/kernel/classification';
import { structureIdsOf } from './familyInternal';

/**
 * What a package narrows itself to, as the kernel reads it - per dimension,
 * the values it allows. Bookings asks this of the packages on a booking to
 * say whether what the client asked for is answered by what is on it: the
 * same set test (`admits`) that decides what may be offered, run the other
 * way round. A plain module: it takes the organization as a parameter.
 */
export async function packageNarrowingsFor(orgId: string, packageIds: string[]): Promise<Map<string, Narrowing>> {
  const out = new Map<string, Narrowing>();
  const ids = [...new Set(packageIds)];
  if (ids.length === 0) return out;

  /*
   * TWO QUESTIONS, NOT TWO PER PACKAGE.
   *
   * This walked the packages one at a time and asked two things of each - which
   * package holds its structure, then what that structure narrows - so a book
   * carrying fifteen packages cost thirty round trips in series. That was
   * thirteen of the bookings page's sixteen seconds: the wait grew with how
   * much the studio had sold, which is the opposite of what a studio should
   * feel as it grows. Both questions are set questions, so both are asked once.
   */
  const structureOf = await structureIdsOf(orgId, ids);
  const { data } = await supabaseAdmin
    .from('packages')
    .select('id, package_services(package_service_dimension_values(dimension_value:dimension_values(id, dimension_id)))')
    .eq('organization_id', orgId)
    .in('id', [...new Set(structureOf.values())]);

  const narrowingOf = new Map<string, Narrowing>();
  for (const pkg of ((data || []) as any[])) {
    const rows: Answer[] = ((pkg.package_services || []) as any[])
      .flatMap((ps) => ((ps.package_service_dimension_values || []) as any[])
        .map((l) => ({ dimensionId: l?.dimension_value?.dimension_id as string, valueId: l?.dimension_value?.id as string }))
        .filter((r) => r.dimensionId && r.valueId));
    narrowingOf.set(pkg.id as string, narrowingFrom(rows));
  }
  // Every package asked for gets an answer, empty where its structure narrows nothing.
  for (const id of ids) out.set(id, narrowingOf.get(structureOf.get(id) ?? id) ?? narrowingFrom([]));
  return out;
}
