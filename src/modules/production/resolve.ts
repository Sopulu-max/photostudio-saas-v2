import { supabaseAdmin } from '@/lib/supabase/admin';
import { listResolvedTasksFor } from '@/modules/packages/interface';
import { lineNameOf } from '@/modules/bookings/interface';

/**
 * A BOOKING'S WORK, RESOLVED.
 *
 * A booking's tasks used to be a copy of its packages' steps, written at
 * booking and never read again from the source. That froze the wrong thing.
 * An instance freezes the PROMISE - what the client is getting, at what price.
 * Tasks are how the studio does the work, and how the studio works is the
 * workflow as it is now: rename a step, add one, drop one, and every job in
 * flight that has not passed it should follow.
 *
 * So the list is resolved here, at the moment of reading: each line's package
 * (an instance, so the departures it was booked with stay) -> each service's
 * workflow, now -> laid over with the booking_tasks rows that exist. A row
 * exists only when something HAPPENED on a step - someone was put on it, it
 * was finished, its role was changed for this job - or when the booking added
 * a step of its own. A step that left the workflow after work was done on it
 * still shows, because a fact does not un-happen.
 *
 * A plain module: it takes the organization as a parameter and is not a
 * server action. The doors in are in domain.ts and work.ts.
 */

export type Person = { id: string; name: string; avatarUrl: string | null };

/** Enough to find, or create, the row for a task that may not have one yet. */
export type TaskRef = {
  id: string | null;
  bookingId: string;
  lineId: string | null;
  packageServiceId: string | null;
  /** The step: the workflow's, or the package's own. One of the two. */
  workflowTaskId: string | null;
  packageTaskId: string | null;
};

export type ResolvedBookingTask = {
  /** The booking_tasks row, when something has happened on this step. */
  id: string | null;
  ref: TaskRef;
  name: string;
  position: number;
  done: boolean;
  completedAt: string | null;
  roleId: string | null;
  roleName: string | null;
  /** The workflow's role for this step - what a null role_id on the row falls back to. */
  workflowRoleName: string | null;
  /** This booking set the role itself, rather than taking the workflow's. */
  roleOverridden: boolean;
  assignee: Person | null;
  /** Which package this came from, or null for work the studio added itself. */
  fromPackage: string | null;
  /** Which service's step this is. A package of photo and video has two "Shoot" tasks. */
  fromService: string | null;
  lineId: string | null;
  packageServiceId: string | null;
  /** The booking's own step, answerable to no workflow - removable here. */
  own: boolean;
};

const ROW_SELECT = `
  id, booking_id, booking_line_id, package_service_id, workflow_task_id, package_task_id,
  name, position, completed_at,
  role:roles(id, name),
  assignee:contacts(id, display_name, avatar_url),
  step:workflow_tasks(name, default_role:roles(id, name)),
  ownStep:package_tasks(name, role:roles(id, name))
`;

const person = (c: any): Person | null =>
  c ? { id: c.id, name: c.display_name, avatarUrl: c.avatar_url ?? null } : null;

/** Every task of each booking, in working order, keyed by booking id. */
export async function resolveBookingTasks(orgId: string, bookingIds: string[]): Promise<Map<string, ResolvedBookingTask[]>> {
  const out = new Map<string, ResolvedBookingTask[]>();
  const ids = [...new Set(bookingIds)];
  if (ids.length === 0) return out;

  const [{ data: lineRows }, { data: rows }] = await Promise.all([
    supabaseAdmin
      .from('booking_lines')
      .select('id, booking_id, title, package_id, created_at, package:packages(name)')
      .eq('organization_id', orgId)
      .in('booking_id', ids)
      .order('created_at'),
    supabaseAdmin
      .from('booking_tasks')
      .select(ROW_SELECT)
      .eq('organization_id', orgId)
      .in('booking_id', ids)
      .order('position'),
  ]);
  const lines = (lineRows || []) as any[];
  const work = await listResolvedTasksFor(orgId, lines.map((l) => l.package_id).filter(Boolean));

  // The rows that exist, by the step they are about.
  const byStep = new Map<string, any>();
  const loose: any[] = [];
  const keyOf = (r: any) => `${r.booking_line_id}|${r.package_service_id}|${r.workflow_task_id ?? `pt:${r.package_task_id}`}`;
  for (const r of (rows || []) as any[]) {
    if (r.workflow_task_id || r.package_task_id) byStep.set(keyOf(r), r);
    else loose.push(r);
  }
  const claimed = new Set<string>();

  for (const bookingId of ids) {
    const tasks: ResolvedBookingTask[] = [];
    let position = 0;

    // The packages' work, as the workflows say it now.
    for (const line of lines.filter((l) => l.booking_id === bookingId && l.package_id)) {
      const fromPackage = lineNameOf(line, '') || null;
      for (const ps of work.get(line.package_id) || []) {
        for (const step of ps.tasks) {
          if (!step.isActive) continue;
          // A step is the workflow's, or the package's own; the row about it
          // is keyed by whichever it is.
          const stepKey = step.workflowTaskId ?? `pt:${step.id}`;
          const key = `${line.id}|${ps.packageServiceId}|${stepKey}`;
          const row = byStep.get(key);
          if (row) claimed.add(key);
          tasks.push({
            id: row?.id ?? null,
            ref: {
              id: row?.id ?? null, bookingId, lineId: line.id, packageServiceId: ps.packageServiceId,
              workflowTaskId: step.workflowTaskId, packageTaskId: step.own ? step.id : null,
            },
            name: (row?.name ?? step.name) as string,
            position: position++,
            done: Boolean(row?.completed_at),
            completedAt: row?.completed_at ?? null,
            roleId: (row?.role?.id ?? step.roleId) as string | null,
            roleName: (row?.role?.name ?? step.roleName) as string | null,
            workflowRoleName: step.roleName,
            roleOverridden: Boolean(row?.role?.id),
            assignee: person(row?.assignee),
            fromPackage,
            fromService: ps.serviceName || null,
            lineId: line.id,
            packageServiceId: ps.packageServiceId,
            own: false,
          });
        }
      }
    }

    // What happened on a step the package no longer calls for. It stays,
    // because it happened.
    for (const r of (rows || []) as any[]) {
      if (r.booking_id !== bookingId || !(r.workflow_task_id || r.package_task_id)) continue;
      if (claimed.has(keyOf(r))) continue;
      if (!r.assignee && !r.completed_at) continue;
      const line = lines.find((l) => l.id === r.booking_line_id);
      tasks.push(shapeLoose(r, bookingId, position++, line, false));
    }

    // The booking's own steps, and steps left standing when theirs was
    // removed from the workflow - both answerable to nothing above them.
    for (const r of loose) {
      if (r.booking_id !== bookingId) continue;
      const line = lines.find((l) => l.id === r.booking_line_id);
      tasks.push(shapeLoose(r, bookingId, position++, line, true));
    }

    out.set(bookingId, tasks);
  }
  return out;
}

function shapeLoose(r: any, bookingId: string, position: number, line: any, own: boolean): ResolvedBookingTask {
  return {
    id: r.id,
    ref: {
      id: r.id, bookingId, lineId: r.booking_line_id ?? null, packageServiceId: r.package_service_id ?? null,
      workflowTaskId: r.workflow_task_id ?? null, packageTaskId: r.package_task_id ?? null,
    },
    // Its own name and role, else the step's while the step still exists.
    name: (r.name ?? r.step?.name ?? r.ownStep?.name ?? 'Untitled step') as string,
    position,
    done: Boolean(r.completed_at),
    completedAt: r.completed_at ?? null,
    roleId: (r.role?.id ?? r.step?.default_role?.id ?? r.ownStep?.role?.id ?? null) as string | null,
    roleName: (r.role?.name ?? r.step?.default_role?.name ?? r.ownStep?.role?.name ?? null) as string | null,
    workflowRoleName: (r.step?.default_role?.name ?? null) as string | null,
    roleOverridden: Boolean(r.role?.id),
    assignee: person(r.assignee),
    fromPackage: line ? (lineNameOf(line, '') || null) : null,
    fromService: null,
    lineId: r.booking_line_id ?? null,
    packageServiceId: r.package_service_id ?? null,
    own,
  };
}

/**
 * The row for a task, made if this is the first thing to happen on its step.
 *
 * A step that nothing has happened on has no row - the workflow says it. The
 * first assignment, completion or role change needs somewhere to land, so
 * this makes the row then, and only for a step the line's package actually
 * resolves to: a caller cannot invent work by naming a step.
 */
export async function ensureTaskRow(orgId: string, ref: TaskRef): Promise<string> {
  if (ref.id) {
    const { data } = await supabaseAdmin
      .from('booking_tasks').select('id')
      .eq('id', ref.id).eq('organization_id', orgId).eq('booking_id', ref.bookingId).maybeSingle();
    if (!data) throw new Error('Task not found');
    return data.id as string;
  }
  if (!ref.lineId || !ref.packageServiceId || !(ref.workflowTaskId || ref.packageTaskId)) throw new Error('Task not found');

  const resolved = await resolveBookingTasks(orgId, [ref.bookingId]);
  const step = (resolved.get(ref.bookingId) || []).find((t) =>
    t.lineId === ref.lineId && t.packageServiceId === ref.packageServiceId
    && t.ref.workflowTaskId === ref.workflowTaskId && t.ref.packageTaskId === ref.packageTaskId);
  if (!step) throw new Error('That step is not part of this booking’s work');
  if (step.id) return step.id;

  const { data: row, error } = await supabaseAdmin
    .from('booking_tasks')
    .insert({
      organization_id: orgId,
      booking_id: ref.bookingId,
      booking_line_id: ref.lineId,
      package_service_id: ref.packageServiceId,
      workflow_task_id: ref.workflowTaskId,
      package_task_id: ref.packageTaskId,
      name: null,
      role_id: null,
      position: step.position,
    })
    .select('id').single();
  if (error || !row) {
    // Two hands reached the same step at once; the index kept one row.
    let q = supabaseAdmin
      .from('booking_tasks').select('id')
      .eq('organization_id', orgId)
      .eq('booking_line_id', ref.lineId).eq('package_service_id', ref.packageServiceId);
    q = ref.workflowTaskId ? q.eq('workflow_task_id', ref.workflowTaskId) : q.eq('package_task_id', ref.packageTaskId!);
    const { data: again } = await q.maybeSingle();
    if (again) return again.id as string;
    console.error('Failed to open a task on this step:', error);
    throw new Error('Failed to reach that task');
  }
  return row.id as string;
}

export type LiveBooking = {
  id: string;
  title: string;
  clientName: string | null;
  scheduledFor: string | null;
  stage: { id: string; name: string; kind: string; color: string | null } | null;
};

/**
 * The bookings that carry work to do, soonest first. Cancelled and completed
 * ones do not; an enquiry with nothing on it yet does, since it is still a
 * job the studio holds. One definition, read by the Work sheet and by the
 * person-reading, so "live" cannot mean two things.
 */
export async function liveBookings(orgId: string): Promise<LiveBooking[]> {
  const { data } = await supabaseAdmin
    .from('bookings')
    .select('id, title, scheduled_for, stage:booking_stages(id, name, kind, color), contact:contacts(display_name)')
    .eq('organization_id', orgId)
    .order('scheduled_for', { ascending: true, nullsFirst: false });
  return ((data || []) as any[])
    .filter((b) => !b.stage || b.stage.kind === 'enquiry' || b.stage.kind === 'booked')
    .map((b) => ({
      id: b.id as string,
      title: b.title as string,
      clientName: (b.contact?.display_name ?? null) as string | null,
      scheduledFor: (b.scheduled_for ?? null) as string | null,
      stage: b.stage ? { id: b.stage.id, name: b.stage.name, kind: b.stage.kind, color: b.stage.color ?? null } : null,
    }));
}
