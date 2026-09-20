/**
 * A package's work, resolved.
 *
 * A PACKAGE HOLDS ONLY ITS DEPARTURES FROM THE WORKFLOW. For a while it held
 * a full copy of every step - cloned when the service was bundled, patched
 * forward by a sync when the workflow was saved, copied again onto every
 * booking's instance - four copies of "Shoot, by a Photographer, first"
 * before anyone could be assigned to it. Fifty-four rows, not one of them
 * different from the workflow it copied. A rename on the workflow reached
 * none of them. The rule members settled applies here exactly: declare
 * nothing, hold only what differs, resolve at read, freeze at booking.
 *
 * So a package_tasks row is now one of two things: a DEPARTURE from a
 * workflow step (workflow_task_id set: switched off, or given another role),
 * or a step of the package's OWN (workflow_task_id null: a name, a role, a
 * position after the workflow's). Everything else is read from the service's
 * workflow at the moment of reading. A booking still freezes the resolved
 * list into booking_tasks - that is what an instance is for.
 */

export type ResolvedTask = {
  /** The package_tasks row, when one exists (a departure or an own step). */
  id: string | null;
  workflowTaskId: string | null;
  name: string;
  roleId: string | null;
  roleName: string | null;
  isActive: boolean;
  position: number;
  /** The package's own step, answerable to no workflow. */
  own: boolean;
  /** The workflow's default role, for telling a departure from the default. */
  defaultRoleId: string | null;
};

/** A raw bundle row as the package reads embed it: its service's workflow steps and its package_tasks. */
export function resolveTasks(ps: any): ResolvedTask[] {
  const steps: any[] = [...((ps?.service?.workflow?.workflow_tasks || []) as any[])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const rows: any[] = (ps?.package_tasks || []) as any[];
  const departures = new Map<string, any>();
  const own: any[] = [];
  for (const r of rows) {
    if (r.workflow_task_id) departures.set(r.workflow_task_id, r);
    else own.push(r);
  }
  const resolved: ResolvedTask[] = steps.map((s, i) => {
    const d = departures.get(s.id);
    return {
      id: d?.id ?? null,
      workflowTaskId: s.id as string,
      name: (s.name as string) ?? '',
      roleId: (d ? (d.role?.id ?? d.role_id ?? null) : (s.default_role?.id ?? s.default_role_id ?? null)) as string | null,
      roleName: (d ? (d.role?.name ?? null) : (s.default_role?.name ?? null)) as string | null,
      isActive: d ? Boolean(d.is_active) : true,
      position: i,
      own: false,
      defaultRoleId: (s.default_role?.id ?? s.default_role_id ?? null) as string | null,
    };
  });
  const base = resolved.length;
  own.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).forEach((r, i) => {
    resolved.push({
      id: r.id as string,
      workflowTaskId: null,
      name: (r.name as string) ?? '',
      roleId: (r.role?.id ?? r.role_id ?? null) as string | null,
      roleName: (r.role?.name ?? null) as string | null,
      isActive: r.is_active !== false,
      position: base + i,
      own: true,
      defaultRoleId: null,
    });
  });
  return resolved;
}
