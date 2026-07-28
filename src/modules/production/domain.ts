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
  stages: { name: string; order: number }[];
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

export async function updateTaskStatus(
  taskId: string,
  organizationId: string,
  newStatus: TaskStatus,
  actorId: string
) {
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
    actorId,
    payload: { from: current.status, to: newStatus }
  });

  revalidatePath('/bookings');
  revalidatePath('/my-tasks');
  return task as Task;
}

/**
 * The work on a set of lines — what the booking hub renders. Tasks with their
 * assignees, grouped by line, plus a derived per-line summary.
 */
export async function getWorkForLines(lineIds: string[]) {
  if (lineIds.length === 0) return {} as Record<string, { tasks: any[]; total: number; completed: number }>;
  const { orgId } = await getAuthOrgId();

  const { data: tasks, error } = await supabaseAdmin
    .from('tasks')
    .select('id, booking_line_id, stage_name, stage_order, status, due_date, assignments(id, employee:employees(id, contact:contacts(display_name)), role:roles(name))')
    .eq('organization_id', orgId)
    .in('booking_line_id', lineIds)
    .order('stage_order');
  if (error) {
    console.error('Failed to load work:', error);
    throw new Error('Failed to load work');
  }

  const byLine: Record<string, { tasks: any[]; total: number; completed: number }> = {};
  for (const t of (tasks || []) as any[]) {
    const bucket = (byLine[t.booking_line_id] ??= { tasks: [], total: 0, completed: 0 });
    bucket.tasks.push({
      id: t.id,
      stageName: t.stage_name,
      status: t.status,
      assignees: (t.assignments || []).map((a: any) => ({
        name: a.employee?.contact?.display_name,
        role: a.role?.name || null,
      })),
    });
    bucket.total += 1;
    if (t.status === 'completed') bucket.completed += 1;
  }
  return byLine;
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
  return { ok: true };
}

/**
 * Put someone on a booking — the studio knows who's shooting it before any task
 * exists. Booking-level crew, distinct from a task-level assignment.
 */
export async function assignToBooking(input: { bookingId: string; employeeId: string; roleId?: string | null }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('assignments')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      task_id: null,
      employee_id: input.employeeId,
      role_id: input.roleId || null,
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
    payload: { employeeId: input.employeeId, roleId: input.roleId ?? null },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

export async function removeFromBooking(input: { bookingId: string; assignmentId: string }) {
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
  return employees.map((e: any) => ({
    employeeId: e.id,
    name: e.contact?.display_name as string,
    roles: (e.employee_roles || []).map((er: any) => ({ id: er.role?.id, name: er.role?.name })).filter((r: any) => r.id),
  }));
}

/**
 * The logged-in person's task list: tasks they're assigned to, with the booking
 * for context.
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

  const { data: rows, error } = await supabaseAdmin
    .from('assignments')
    .select('task:tasks!inner(id, stage_name, status, due_date, line:booking_lines!inner(id, title, booking:bookings!inner(id, title)))')
    .eq('organization_id', orgId)
    .eq('employee_id', me.id)
    .not('task_id', 'is', null);
  if (error) {
    console.error('Failed to load my tasks:', error);
    throw new Error('Failed to load your tasks');
  }

  return ((rows || []) as any[]).map((r) => ({
    taskId: r.task.id,
    stageName: r.task.stage_name,
    status: r.task.status,
    dueDate: r.task.due_date,
    lineTitle: r.task.line?.title,
    bookingId: r.task.line?.booking?.id,
    bookingTitle: r.task.line?.booking?.title,
  }));
}
