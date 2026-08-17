'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/kernel/events';
import type { Task, TaskStatus } from '@/lib/types/engine';
import { revalidatePath } from 'next/cache';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

/**
 * Production — the doing. The booking LINE is the production unit: tasks hang
 * directly off a line (no workflow container), and a line's production state is
 * derived from its tasks. Assignments put employees on tasks or bookings, in a
 * role.
 */

// Valid state machine transitions for Task
const TASK_TRANSITIONS: Record<string, TaskStatus[]> = {
  created:     ['assigned', 'in_progress'],
  assigned:    ['in_progress', 'blocked', 'created'],
  in_progress: ['blocked', 'completed'],
  blocked:     ['in_progress', 'created'],
  completed:   [], // Terminal state
};

/**
 * Start work on a booking line: seed its tasks from the stages handed in
 * (Bookings asks Services for the line's production plan and passes it here).
 * A line with no plan gets a single free-form stage so work can still start.
 */
export async function startWorkForBookingLine(input: {
  bookingId: string;
  lineId: string;
  stages: { name: string; order: number; roleId?: string | null; frontStage?: boolean | null }[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const stages = (input.stages?.length ?? 0) > 0 ? input.stages : [{ name: 'Do the work', order: 0 }];

  for (const [i, stage] of stages.entries()) {
    const { data: task, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        organization_id: orgId,
        booking_line_id: input.lineId,
        stage_name: stage.name,
        stage_order: stage.order ?? i,
        // The routing this stage suggested — a lead for the assignment
        // picker, never a lock. A studio can still assign anyone.
        suggested_role_id: (stage as any).roleId ?? null,
        is_front_stage: (stage as any).frontStage ?? null,
      })
      .select('id')
      .single();
    if (error || !task) {
      console.error('Failed to seed task:', error);
      throw new Error('Failed to start work');
    }
    await logEvent({
      organizationId: orgId,
      entityType: 'task',
      entityId: task.id,
      action: 'created',
      actorId: actorId ?? undefined,
      payload: { bookingId: input.bookingId, lineId: input.lineId, stageName: stage.name },
    });
  }

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true, taskCount: stages.length };
}

/**
 * Move a task along its state machine.
 *
 * The organization and the actor come from the session. They were parameters
 * until now, passed in as props by the two browser components that call this —
 * which meant the log's record of who moved a task was whatever the browser
 * said it was.
 */
export async function updateTaskStatus(taskId: string, newStatus: TaskStatus) {
  const { orgId: organizationId, personId: actorId } = await getAuthOrgId();

  // STATE MACHINE GUARD
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !current) {
    throw new Error('Task not found');
  }

  const allowedTransitions = TASK_TRANSITIONS[current.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Illegal task state transition: '${current.status}' → '${newStatus}'. Allowed: [${allowedTransitions.join(', ')}]`
    );
  }

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .update({ status: newStatus })
    .eq('id', taskId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update task status:', error);
    throw new Error('Failed to update task status');
  }

  await logEvent({
    organizationId,
    entityType: 'task',
    entityId: task.id,
    action: 'status_updated',
    actorId: actorId ?? undefined,
    payload: { from: current.status, to: newStatus }
  });

  revalidatePath('/bookings');
  revalidatePath('/tasks');
  return task as Task;
}

/**
 * The work on a set of lines — what the booking hub renders. Tasks with their
 * assignees, grouped by line, plus a derived per-line summary.
 *
 * When bookingId is supplied the function also fetches the booking's direct
 * crew and uses them as *implicit* assignees for tasks whose suggested role
 * maps to exactly one crew member and that have no explicit assignment yet.
 * This removes the need to separately assign someone to a task after they've
 * already been put on the booking in the right role.
 */
export async function getWorkForLines(lineIds: string[], bookingId?: string) {
  if (lineIds.length === 0) return {} as Record<string, { tasks: any[]; total: number; completed: number }>;
  const { orgId } = await getAuthOrgId();

  const { data: tasks, error } = await supabaseAdmin
    .from('tasks')
    .select('id, booking_line_id, stage_name, stage_order, status, due_date, suggested_role_id, is_front_stage, suggested_role:roles(name), assignments(id, employee:employees(id, contact:contacts(display_name)), role:roles(name))')
    .eq('organization_id', orgId)
    .in('booking_line_id', lineIds)
    .order('stage_order');
  if (error) {
    console.error('Failed to load work:', error);
    throw new Error('Failed to load work');
  }

  // Build a role → crew members map from the booking's direct assignments so
  // tasks can derive their owner without a separate explicit assignment row.
  const crewByRoleId = new Map<string, any[]>();
  if (bookingId) {
    const { data: bookingCrew } = await supabaseAdmin
      .from('assignments')
      .select('id, employee_id, role_id, employee:employees(id, contact:contacts(display_name)), role:roles(name)')
      .eq('organization_id', orgId)
      .eq('booking_id', bookingId)
      .is('task_id', null);
    for (const m of (bookingCrew || []) as any[]) {
      if (!m.role_id) continue;
      const bucket = crewByRoleId.get(m.role_id) ?? [];
      bucket.push({
        assignmentId: m.id,
        employeeId: m.employee_id,
        name: m.employee?.contact?.display_name || 'Unknown',
        role: m.role?.name || null,
        implicit: true,
      });
      crewByRoleId.set(m.role_id, bucket);
    }
  }

  const byLine: Record<string, { tasks: any[]; total: number; completed: number }> = {};
  for (const t of (tasks || []) as any[]) {
    const bucket = (byLine[t.booking_line_id] ??= { tasks: [], total: 0, completed: 0 });

    const explicitAssignees = (t.assignments || []).map((a: any) => ({
      assignmentId: a.id,
      employeeId: a.employee?.id,
      name: a.employee?.contact?.display_name,
      role: a.role?.name || null,
    }));

    // Derive implicit assignees only when: no explicit assignment exists, the
    // task has a suggested role, and exactly one crew member holds that role on
    // this booking. Multiple matches are ambiguous — the studio must pick.
    const implicitAssignees: any[] =
      explicitAssignees.length === 0 && t.suggested_role_id
        ? (() => {
            const matches = crewByRoleId.get(t.suggested_role_id) ?? [];
            return matches.length === 1 ? matches : [];
          })()
        : [];

    bucket.tasks.push({
      id: t.id,
      stageName: t.stage_name,
      status: t.status,
      dueDate: t.due_date,
      suggestedRoleId: t.suggested_role_id,
      suggestedRoleName: t.suggested_role?.name || null,
      isFrontStage: t.is_front_stage,
      assignees: [...explicitAssignees, ...implicitAssignees],
    });
    bucket.total += 1;
    if (t.status === 'completed') bucket.completed += 1;
  }
  return byLine;
}

/** When this task is due, or clear it. Studio-set, never inferred. */
export async function setTaskDueDate(input: { taskId: string; dueDate: string | null }) {
  const { orgId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('tasks')
    .update({ due_date: input.dueDate })
    .eq('id', input.taskId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to set the due date');

  revalidatePath('/bookings');
  revalidatePath('/calendar');
  revalidatePath('/tasks');
  return { ok: true };
}

/**
 * Assign an employee to a task, in a role. Several people can work one task
 * (a Lead and a Second Shooter), and each assignment records which role they
 * are filling.
 */
export async function assignTask(input: { taskId: string; employeeId: string; roleId?: string | null }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('assignments')
    .insert({
      organization_id: orgId,
      task_id: input.taskId,
      employee_id: input.employeeId,
      role_id: input.roleId || null,
    });
  if (error) {
    console.error('Failed to assign task:', error);
    throw new Error('Failed to assign (already assigned in that role?)');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'task',
    entityId: input.taskId,
    action: 'assigned',
    actorId: actorId ?? undefined,
    payload: { employeeId: input.employeeId, roleId: input.roleId ?? null },
  });

  revalidatePath('/bookings');
  revalidatePath('/tasks');
  return { ok: true };
}

/**
 * Put someone on a booking — the studio knows who's shooting it before any task
 * exists. Booking-level crew, distinct from a task-level assignment.
 */
export async function assignToBooking(input: { bookingId: string; employeeId: string; roleId: string }) {
  // Required, not optional. Task owners are derived by matching a task's
  // suggested role against this row's role — a booking assignment without one
  // is skipped by every reader, so it looked like crew and staffed nothing.
  if (!input.roleId) throw new Error('Say what they are doing on this booking.');
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('assignments')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      task_id: null,
      employee_id: input.employeeId,
      role_id: input.roleId,
    });
  if (error) {
    console.error('Failed to assign to booking:', error);
    throw new Error('Failed to add them (already on this booking in that role?)');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: input.bookingId,
    action: 'crew_assigned',
    actorId: actorId ?? undefined,
    payload: { employeeId: input.employeeId, roleId: input.roleId },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/** Take someone off — a booking-level assignment or a task-level one, same row shape either way. */
export async function removeAssignment(input: { bookingId: string; assignmentId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('assignments')
    .delete()
    .eq('id', input.assignmentId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to remove assignment:', error);
    throw new Error('Failed to remove them');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: input.bookingId,
    action: 'crew_removed',
    actorId: actorId ?? undefined,
    payload: { assignmentId: input.assignmentId },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/tasks');
  return { ok: true };
}

/**
 * Who is on this booking: people put on the booking directly, plus everyone
 * assigned to any of its lines' tasks (rolled up, de-duplicated).
 */
export async function listCrewForBooking(bookingId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: direct } = await supabaseAdmin
    .from('assignments')
    .select('id, employee_id, role_id, task_id, employee:employees(id, contact:contacts(display_name)), role:roles(name)')
    .eq('organization_id', orgId)
    .eq('booking_id', bookingId);

  const { data: viaTasks } = await supabaseAdmin
    .from('assignments')
    .select('id, employee_id, role_id, task_id, employee:employees(id, contact:contacts(display_name)), role:roles(name), task:tasks!inner(id, stage_name, line:booking_lines!inner(booking_id))')
    .eq('organization_id', orgId)
    .eq('task.line.booking_id', bookingId);

  const rows = [...(direct || []), ...(viaTasks || [])];
  const seen = new Map<string, any>();
  for (const r of rows as any[]) {
    const key = `${r.employee_id}:${r.role_id ?? ''}`;
    if (!seen.has(key)) {
      seen.set(key, {
        assignmentId: r.id,
        employeeId: r.employee_id,
        name: r.employee?.contact?.display_name || 'Unknown',
        // Both: the name reads, the id matches. Matching staffing needs by
        // name would break the moment a studio renames a role.
        roleId: r.role_id ?? null,
        role: r.role?.name || null,
        onBookingDirectly: !r.task_id,
        via: r.task_id ? (r.task?.stage_name ?? 'a task') : null,
      });
    }
  }
  return Array.from(seen.values());
}

/**
 * Who can be put on a task. Production asks Team for the roster rather than
 * reading employees/contacts itself.
 */
export async function listAssignableEmployees() {
  const { listEmployees } = await import('@/modules/team/interface');
  const employees = await listEmployees();
  // Archived employees aren't offered for a new assignment — same rule as
  // retired services and archived clients.
  return employees.filter((e: any) => e.status !== 'archived').map((e: any) => ({
    employeeId: e.id,
    name: e.contact?.display_name as string,
    roles: (e.employee_roles || []).map((er: any) => ({ id: er.role?.id, name: er.role?.name })).filter((r: any) => r.id),
  }));
}

/** The logged-in person's own employee id, if they are one — for "assigned to me" filters. */
export async function getMyEmployeeId(): Promise<string | null> {
  const { orgId, contactId } = await getAuthOrgId();
  if (!contactId) return null;
  const { data } = await supabaseAdmin
    .from('employees')
    .select('id')
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * The logged-in person's task list: tasks they're assigned to (explicit), plus
 * tasks they own implicitly because they're the sole crew member holding the
 * task's suggested role on the booking.
 */
export async function listMyTasks() {
  const { orgId, contactId } = await getAuthOrgId();
  if (!contactId) return [];

  const { data: me } = await supabaseAdmin
    .from('employees')
    .select('id')
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .maybeSingle();
  if (!me) return [];

  return _listTasksForEmployeeId(me.id, orgId);
}

/**
 * Every task in the studio, whoever it's assigned to (or no one) — the
 * management view. listMyTasks stays as the personal lens; this is the
 * "who is doing what, across everything" one, filtered client-side rather
 * than duplicating that logic on the server for what's typically a small list.
 */
export async function listTasks() {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select(`
      id, stage_name, status, due_date, suggested_role_id, is_front_stage,
      suggested_role:roles(name),
      line:booking_lines!inner(id, title, booking:bookings!inner(id, title)),
      assignments(id, employee:employees(id, contact:contacts(display_name)), role:roles(name))
    `)
    .eq('organization_id', orgId)
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) {
    console.error('Failed to list tasks:', error);
    throw new Error('Failed to load tasks');
  }

  return ((data || []) as any[]).map((t) => ({
    taskId: t.id,
    stageName: t.stage_name,
    status: t.status,
    dueDate: t.due_date,
    suggestedRoleId: t.suggested_role_id,
    suggestedRoleName: t.suggested_role?.name || null,
    isFrontStage: t.is_front_stage,
    lineTitle: t.line?.title,
    bookingId: t.line?.booking?.id,
    bookingTitle: t.line?.booking?.title,
    assignees: (t.assignments || []).map((a: any) => ({
      assignmentId: a.id,
      employeeId: a.employee?.id,
      name: a.employee?.contact?.display_name,
      role: a.role?.name || null,
    })),
  }));
}

/**
 * Task deadlines within a window — the calendar's deadline layer. Carries the
 * booking for context so a due date is readable on its own.
 */
export async function listTaskDeadlinesInRange(fromISO: string, toISO: string) {
  const { orgId } = await getAuthOrgId();

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('id, stage_name, status, due_date, line:booking_lines!inner(title, booking:bookings!inner(id, title))')
    .eq('organization_id', orgId)
    .not('due_date', 'is', null)
    .gte('due_date', fromISO)
    .lte('due_date', toISO)
    .order('due_date');
  if (error) {
    console.error('Failed to list task deadlines:', error);
    return [];
  }

  return ((data || []) as any[]).map((t) => ({
    kind: 'deadline' as const,
    at: t.due_date,
    taskId: t.id,
    title: t.stage_name,
    status: t.status,
    bookingId: t.line?.booking?.id,
    bookingTitle: t.line?.booking?.title,
    lineTitle: t.line?.title,
  }));
}

/**
 * Tasks assigned to a specific employee — used by the employee detail page.
 * Same shape as listMyTasks but parameterised rather than resolving from the
 * logged-in session. Requires auth (tenant scope still needed).
 */
export async function listTasksForEmployee(employeeId: string) {
  const { orgId } = await getAuthOrgId();
  return _listTasksForEmployeeId(employeeId, orgId);
}

/**
 * Shared impl for listMyTasks and listTasksForEmployee. Returns both explicit
 * task assignments and tasks the employee implicitly owns via booking-crew role
 * matching (sole holder of the task's suggested role on that booking).
 */
async function _listTasksForEmployeeId(employeeId: string, orgId: string) {
  // 1. Explicitly assigned tasks
  const { data: explicitRows, error } = await supabaseAdmin
    .from('assignments')
    .select('task:tasks!inner(id, stage_name, status, due_date, line:booking_lines!inner(id, title, booking:bookings!inner(id, title)))')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .not('task_id', 'is', null);
  if (error) {
    console.error('Failed to load employee tasks:', error);
    throw new Error('Failed to load tasks');
  }

  const explicitTaskIds = new Set(((explicitRows || []) as any[]).map((r) => r.task.id));
  const explicit = ((explicitRows || []) as any[]).map((r) => ({
    taskId: r.task.id,
    stageName: r.task.stage_name,
    status: r.task.status,
    dueDate: r.task.due_date,
    lineTitle: r.task.line?.title,
    bookingId: r.task.line?.booking?.id,
    bookingTitle: r.task.line?.booking?.title,
    implicit: false,
  }));

  // 2. Booking-level assignments → derive implicit task ownership
  const { data: bookingAssignments } = await supabaseAdmin
    .from('assignments')
    .select('booking_id, role_id')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .not('booking_id', 'is', null)
    .is('task_id', null);

  const bookingRoles = ((bookingAssignments || []) as any[]).filter((a) => a.role_id);
  if (bookingRoles.length === 0) return explicit;

  // For each (booking, role) pair, find tasks with that suggested role. We then
  // filter to the ones where this employee is the *only* crew member holding
  // that role on the booking — ambiguous cases still need explicit assignment.
  const roleIds = [...new Set(bookingRoles.map((a: any) => a.role_id as string))];

  // Fetch all tasks that suggest a role this employee holds, then narrow in JS.
  const { data: candidateTasks } = await supabaseAdmin
    .from('tasks')
    .select('id, stage_name, status, due_date, suggested_role_id, line:booking_lines!inner(id, title, booking_id, booking:bookings!inner(id, title))')
    .eq('organization_id', orgId)
    .in('suggested_role_id', roleIds);

  // For each booking this employee is on, check how many people share that role.
  // Only proceed if exactly one (them).
  const bookingIdSet = new Set(bookingRoles.map((a: any) => a.booking_id as string));
  const roleForBooking = new Map<string, string>(); // bookingId → roleId (their role)
  for (const a of bookingRoles) roleForBooking.set(a.booking_id, a.role_id);

  // Count how many crew members hold each role per booking
  const { data: allCrewInBookings } = await supabaseAdmin
    .from('assignments')
    .select('booking_id, role_id, employee_id')
    .eq('organization_id', orgId)
    .in('booking_id', [...bookingIdSet])
    .is('task_id', null)
    .not('role_id', 'is', null);

  // crewCount[bookingId+roleId] = number of people with that role on that booking
  const crewCount = new Map<string, number>();
  for (const a of (allCrewInBookings || []) as any[]) {
    const key = `${a.booking_id}:${a.role_id}`;
    crewCount.set(key, (crewCount.get(key) ?? 0) + 1);
  }

  const implicit = ((candidateTasks || []) as any[])
    .filter((t) => {
      if (explicitTaskIds.has(t.id)) return false;
      const taskBookingId = t.line?.booking_id;
      if (!taskBookingId || !bookingIdSet.has(taskBookingId)) return false;
      if (roleForBooking.get(taskBookingId) !== t.suggested_role_id) return false;
      // Only implicit when this employee is the sole holder of the role
      const key = `${taskBookingId}:${t.suggested_role_id}`;
      return (crewCount.get(key) ?? 0) === 1;
    })
    .map((t) => ({
      taskId: t.id,
      stageName: t.stage_name,
      status: t.status,
      dueDate: t.due_date,
      lineTitle: t.line?.title,
      bookingId: t.line?.booking?.id,
      bookingTitle: t.line?.booking?.title,
      implicit: true,
    }));

  return [...explicit, ...implicit];
}

/**
 * Bookings an employee is assigned to directly (not via tasks) — the
 * "on this shoot" level. A booking without any task yet still shows up here
 * so the studio can see their full schedule at a glance.
 */
export async function listBookingAssignmentsForEmployee(employeeId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: rows, error } = await supabaseAdmin
    .from('assignments')
    .select('id, role:roles(name), booking:bookings!inner(id, title, scheduled_for, stage:booking_stages(name, kind, color))')
    .eq('organization_id', orgId)
    .eq('employee_id', employeeId)
    .not('booking_id', 'is', null)
    .is('task_id', null);
  if (error) {
    console.error('Failed to load employee booking assignments:', error);
    return [];
  }

  return ((rows || []) as any[]).map((r) => ({
    assignmentId: r.id,
    role: r.role?.name ?? null,
    bookingId: r.booking.id,
    bookingTitle: r.booking.title,
    scheduledFor: r.booking.scheduled_for,
    stage: r.booking.stage,
  }));
}

// ── Physical Production Plane (Assets) ──────────────────────────────────────

/**
 * Register an asset produced by a task. This establishes the provenance graph:
 * an Asset is produced by a Task, and optionally derived from an earlier Asset.
 */
export async function registerAssetForTask(input: {
  bookingId: string;
  taskId: string;
  deliverableId?: string | null;
  derivedFromAssetId?: string | null;
  storagePath: string | null;
  fileName: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  state?: string;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: asset, error } = await supabaseAdmin
    .from('assets')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      deliverable_id: input.deliverableId || null,
      produced_by_task_id: input.taskId,
      derived_from_asset_id: input.derivedFromAssetId || null,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType || null,
      size_bytes: input.sizeBytes ?? null,
      state: input.state || 'draft',
    })
    .select('id')
    .single();

  if (error || !asset) {
    console.error('Failed to register asset:', error);
    throw new Error('Failed to register production asset');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'task',
    entityId: input.taskId,
    action: 'asset_produced',
    actorId: actorId ?? undefined,
    payload: { assetId: asset.id, fileName: input.fileName },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { assetId: asset.id };
}
