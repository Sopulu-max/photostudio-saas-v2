import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveTasks, type ResolvedTask } from './workShape';

/**
 * The work a set of packages calls for, resolved per bundled service.
 *
 * A plain module, not a server action: this takes the organization as a
 * parameter, and an exported async function in a 'use server' file is an
 * endpoint anyone can call with any argument. Production reads the work of a
 * booking's packages through here (via the interface), for many bookings at
 * once, at the moment of reading - nothing is copied anywhere.
 */
export type PackageWork = { packageServiceId: string; serviceName: string; position: number; tasks: ResolvedTask[] };

export async function listResolvedTasksFor(orgId: string, packageIds: string[]): Promise<Map<string, PackageWork[]>> {
  const out = new Map<string, PackageWork[]>();
  const ids = [...new Set(packageIds)];
  if (ids.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from('package_services')
    .select(`id, package_id, position,
      service:services(id, name, workflow:workflows(id, workflow_tasks(id, name, position, default_role:roles(id, name)))),
      package_tasks(id, workflow_task_id, name, role:roles(id, name), position, is_active)`)
    .eq('organization_id', orgId)
    .in('package_id', ids)
    .order('position');
  if (error) {
    console.error('Failed to read the work the packages call for:', error);
    return out;
  }
  for (const ps of (data || []) as any[]) {
    const list = out.get(ps.package_id) ?? [];
    list.push({
      packageServiceId: ps.id as string,
      serviceName: (ps.service?.name ?? '') as string,
      position: (ps.position ?? 0) as number,
      tasks: resolveTasks(ps),
    });
    out.set(ps.package_id, list);
  }
  return out;
}
