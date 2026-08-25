'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertOurs } from '@/kernel/tenancy';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

/**
 * Production - the doing. The booking LINE is the production unit.
 * Work progress is tracked by setting the current label on the booking line.
 * Assignments put employees on lines, in a role.
 */



/** Assign a person to a booking line (in a specific role). */
export async function assignToBookingLine(input: {
  bookingId: string;
  lineId: string;
  employeeId: string;
  roleId: string | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  await assertOurs(orgId, [
    { table: 'booking_lines', id: input.lineId, label: 'booking line' },
    { table: 'employees', id: input.employeeId, label: 'employee' },
  ]);

  const { error } = await supabaseAdmin
    .from('assignments')
    .insert({
      organization_id: orgId,
      booking_line_id: input.lineId,
      employee_id: input.employeeId,
      role_id: input.roleId,
    });

  if (error) {
    console.error('Failed to assign:', error);
    throw new Error('Failed to assign employee');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking_line',
    entityId: input.lineId,
    action: 'assignment_created',
    actorId: actorId ?? undefined,
    payload: { employeeId: input.employeeId, roleId: input.roleId },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/** Remove an assignment from a booking line. */
export async function removeAssignment(input: {
  bookingId: string;
  assignmentId: string;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  await assertOurs(orgId, [{ table: 'assignments', id: input.assignmentId, label: 'assignment' }]);

  const { error } = await supabaseAdmin
    .from('assignments')
    .delete()
    .eq('id', input.assignmentId)
    .eq('organization_id', orgId);

  if (error) {
    throw new Error('Failed to remove assignment');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'assignment',
    entityId: input.assignmentId,
    action: 'deleted',
    actorId: actorId ?? undefined,
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}



export async function assignToTask(input: {
  bookingId: string;
  taskId: string;
  employeeId: string;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  await assertOurs(orgId, [
    { table: 'booking_line_tasks', id: input.taskId, label: 'task' },
    { table: 'contacts', id: input.employeeId, label: 'contact' },
  ]);

  const { error } = await supabaseAdmin
    .from('booking_line_tasks')
    .update({ assignee_id: input.employeeId })
    .eq('id', input.taskId)
    .eq('organization_id', orgId);

  if (error) {
    console.error('Failed to assign task:', error);
    throw new Error('Failed to assign task');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking_line_task',
    entityId: input.taskId,
    action: 'task_assigned',
    actorId: actorId ?? undefined,
    payload: { employeeId: input.employeeId },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

export async function unassignTask(input: {
  bookingId: string;
  taskId: string;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  await assertOurs(orgId, [{ table: 'booking_line_tasks', id: input.taskId, label: 'task' }]);

  const { error } = await supabaseAdmin
    .from('booking_line_tasks')
    .update({ assignee_id: null })
    .eq('id', input.taskId)
    .eq('organization_id', orgId);

  if (error) {
    console.error('Failed to unassign task:', error);
    throw new Error('Failed to unassign task');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking_line_task',
    entityId: input.taskId,
    action: 'task_unassigned',
    actorId: actorId ?? undefined,
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

export async function advanceBookingLineTask(input: {
  bookingId: string;
  lineId: string;
  taskId: string | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  await assertOurs(orgId, [
    { table: 'bookings', id: input.bookingId, label: 'booking' },
    { table: 'booking_lines', id: input.lineId, label: 'booking line' },
  ]);

  if (input.taskId) {
    await assertOurs(orgId, [{ table: 'booking_line_tasks', id: input.taskId, label: 'task' }]);
  }

  const { error } = await supabaseAdmin
    .from('booking_lines')
    .update({ current_task_id: input.taskId, updated_at: new Date().toISOString() })
    .eq('id', input.lineId)
    .eq('organization_id', orgId);

  if (error) {
    console.error('Failed to advance task:', error);
    throw new Error('Failed to advance task');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking_line',
    entityId: input.lineId,
    action: 'task_advanced',
    actorId: actorId ?? undefined,
    payload: { bookingId: input.bookingId, taskId: input.taskId },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}


