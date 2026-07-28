'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/actions/events';
import type { Workflow, Task, TaskStatus, WorkflowStatus, WorkflowTemplate, WorkflowStageDefinition } from '@/lib/types/engine';
import { revalidatePath } from 'next/cache';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

// Valid state machine transitions for Task
const TASK_TRANSITIONS: Record<string, TaskStatus[]> = {
  created:     ['assigned', 'in_progress'],
  assigned:    ['in_progress', 'blocked', 'created'],
  in_progress: ['blocked', 'completed'],
  blocked:     ['in_progress', 'created'],
  completed:   [], // Terminal state
};

// Valid state machine transitions for Workflow
const WORKFLOW_TRANSITIONS: Record<string, WorkflowStatus[]> = {
  created:     ['in_progress', 'halted'],
  in_progress: ['completed', 'halted'],
  completed:   [], // Terminal state
  halted:      ['in_progress'], // Can resume
};

export async function createWorkflow(params: {
  organizationId: string;
  contractId: string;
  templateId?: string;
  actorId: string;
  meta?: Record<string, unknown>;
}) {
  const { data: workflow, error } = await supabaseAdmin
    .from('workflows')
    .insert({
      organization_id: params.organizationId,
      contract_id: params.contractId,
      template_id: params.templateId || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create workflow:', error);
    throw new Error('Failed to create workflow');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'workflow',
    entityId: workflow.id,
    action: 'created',
    actorId: params.actorId,
    payload: { contractId: params.contractId, templateId: params.templateId, ...(params.meta || {}) }
  });

  return workflow as Workflow;
}

export async function createTask(params: {
  organizationId: string;
  workflowId: string;
  stageName: string;
  stageOrder: number;
  assignedPersonId?: string;
  dueDate?: string;
  actorId: string;
  meta?: Record<string, unknown>;
}) {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      organization_id: params.organizationId, // FIX: was missing
      workflow_id: params.workflowId,
      stage_name: params.stageName,
      stage_order: params.stageOrder,
      assigned_person_id: params.assignedPersonId || null,
      due_date: params.dueDate || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create task:', error);
    throw new Error('Failed to create task');
  }

  await logEvent({
    organizationId: params.organizationId,
    entityType: 'task',
    entityId: task.id,
    action: 'created',
    actorId: params.actorId,
    payload: { stageName: params.stageName, stageOrder: params.stageOrder, workflowId: params.workflowId, ...(params.meta || {}) }
  });

  return task as Task;
}

export async function updateTaskStatus(
  taskId: string,
  organizationId: string,
  newStatus: TaskStatus,
  actorId: string
) {
  // STATE MACHINE GUARD: Fetch current state
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

  return task as Task;
}

export async function updateWorkflowStatus(
  workflowId: string,
  organizationId: string,
  newStatus: WorkflowStatus,
  actorId: string
) {
  // STATE MACHINE GUARD
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('workflows')
    .select('status')
    .eq('id', workflowId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !current) {
    throw new Error('Workflow not found');
  }

  const allowedTransitions = WORKFLOW_TRANSITIONS[current.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Illegal workflow state transition: '${current.status}' → '${newStatus}'. Allowed: [${allowedTransitions.join(', ')}]`
    );
  }

  const { data: workflow, error } = await supabaseAdmin
    .from('workflows')
    .update({ status: newStatus })
    .eq('id', workflowId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update workflow status:', error);
    throw new Error('Failed to update workflow status');
  }

  await logEvent({
    organizationId,
    entityType: 'workflow',
    entityId: workflow.id,
    action: 'status_updated',
    actorId,
    payload: { from: current.status, to: newStatus }
  });

  return workflow as Workflow;
}

/**
 * Assign an employee to a task, in a role. Several people can work one task
 * (a Lead and a Second Shooter), and each assignment records which role they
 * are filling — the requirement the single assigned_person_id could not meet.
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

  revalidatePath('/workflows');
  return { ok: true };
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
 * Start work for a booking line — Production owns creating the work and seeding
 * its stages. Bookings calls this rather than writing workflows/tasks itself.
 * No contract required: the kernel is unlocked, and starting work is the
 * studio's deliberate choice.
 */
export async function startWorkForBookingLine(input: {
  bookingId: string;
  lineId: string;
  blueprintId?: string | null;
  stages: { name: string; order: number }[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: workflow, error } = await supabaseAdmin
    .from('workflows')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      booking_line_id: input.lineId,
      contract_id: null,
      blueprint_id: input.blueprintId ?? null,
      status: 'created',
    })
    .select('id')
    .single();

  if (error || !workflow) {
    console.error('Failed to start work:', error);
    throw new Error('Failed to start work');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'workflow',
    entityId: workflow.id,
    action: 'created',
    actorId: actorId ?? undefined,
    payload: { bookingId: input.bookingId, lineId: input.lineId, trigger: 'manual_start' },
  });

  for (const [i, stage] of (input.stages || []).entries()) {
    const { data: task } = await supabaseAdmin
      .from('tasks')
      .insert({ organization_id: orgId, workflow_id: workflow.id, stage_name: stage.name, stage_order: stage.order ?? i })
      .select('id')
      .single();
    if (task) {
      await logEvent({
        organizationId: orgId,
        entityType: 'task',
        entityId: task.id,
        action: 'created',
        actorId: actorId ?? undefined,
        payload: { workflowId: workflow.id, stageName: stage.name },
      });
    }
  }

  return { workflowId: workflow.id };
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
 * assigned to any of its tasks (rolled up, de-duplicated). Production owns this
 * because it owns the work — Bookings asks for it.
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
    .select('id, employee_id, role_id, task_id, employee:employees(id, contact:contacts(display_name)), role:roles(name), task:tasks!inner(id, stage_name, workflow:workflows!inner(booking_id))')
    .eq('organization_id', orgId)
    .eq('task.workflow.booking_id', bookingId);

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
