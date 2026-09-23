'use server';

import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { studioTimezone } from '@/kernel/studioHours';
import { calendarIn, dayIn, bandOf, whenItems, type Band } from '@/kernel/bands';
import { axisOf, valuesSeen, type LensGroup, type Takes } from '@/kernel/lenses';
import { resolveBookingTasks, liveBookings, type Person } from './resolve';

/**
 * THE TASKS SHEET - every task on every live booking, as structured data,
 * read as simple data analysis (kernel/lenses).
 *
 * The task is the grain, not the booking: the questions a studio asks
 * here are which tasks are done and which are not, who is on what, where
 * it is short. Each row is one task - the workflow's step as it is now
 * with what happened on this booking laid over it (resolve.ts) - with the
 * booking it belongs to. Nothing is stored; this is the tasks, read.
 *
 * THE AXES ARE READ OFF THE ROWS: Status (open, done); Person (everyone
 * on a task, and nobody); Role (each role a task asks for); Task (each
 * distinct task name); Service; Package; the booking's Stage; When (the
 * booking's band on the studio's clock); Booking. A studio with other
 * roles, other task names, other stages sees its own. Grouped by Person
 * this is "who is carrying what"; Person: nobody is "where we are short";
 * grouped by Booking it is each job's work, task by task.
 */

export type TaskRow = {
  /** A stable key: the row's id when something happened, else the step's address. */
  id: string;
  name: string;
  position: number;
  done: boolean;
  completedAt: string | null;
  role: { id: string; name: string } | null;
  assignee: Person | null;
  fromService: string | null;
  fromPackage: string | null;
  booking: {
    id: string;
    title: string;
    clientName: string | null;
    scheduledFor: string | null;
    stage: { id: string; name: string; kind: string; color: string | null } | null;
  };
  band: Band;
  /** The booking's day on the studio's clock, yyyy-mm-dd - null when unscheduled. */
  day: string | null;
  takes: Takes;
};

export type TasksSheet = {
  rows: TaskRow[];
  lenses: LensGroup[];
  today: string;
};

export async function readTasksSheet(): Promise<TasksSheet> {
  const { orgId } = await getAuthOrgId();
  const [live, timezone] = await Promise.all([liveBookings(orgId), studioTimezone(orgId)]);
  const cal = calendarIn(timezone);
  const byBooking = live.length > 0 ? await resolveBookingTasks(orgId, live.map((b) => b.id)) : new Map();

  const rows: TaskRow[] = [];
  for (const b of live) {
    const day = b.scheduledFor ? dayIn(b.scheduledFor, timezone) : null;
    const band = bandOf(day, cal);
    for (const t of byBooking.get(b.id) || []) {
      const role = t.roleId ? { id: t.roleId, name: t.roleName ?? 'Role' } : null;
      const takes: Takes = {
        status: [t.done ? 'done' : 'open'],
        person: t.assignee ? [t.assignee.id] : [],
        role: role ? [role.id] : [],
        task: [t.name],
        service: t.fromService ? [t.fromService] : [],
        package: t.fromPackage ? [t.fromPackage] : [],
        stage: b.stage ? [b.stage.id] : [],
        when: [band],
        booking: [b.id],
      };
      rows.push({
        id: t.id ?? `${b.id}:${t.lineId ?? ''}:${t.packageServiceId ?? ''}:${t.ref.workflowTaskId ?? t.ref.packageTaskId ?? t.position}`,
        name: t.name, position: t.position, done: t.done, completedAt: t.completedAt,
        role, assignee: t.assignee, fromService: t.fromService, fromPackage: t.fromPackage,
        booking: { id: b.id, title: b.title, clientName: b.clientName, scheduledFor: b.scheduledFor, stage: b.stage },
        band, day, takes,
      });
    }
  }

  // Names for the ids the rows carry.
  const personName = new Map(rows.flatMap((r) => (r.assignee ? [[r.assignee.id, r.assignee.name] as const] : [])));
  const roleName = new Map(rows.flatMap((r) => (r.role ? [[r.role.id, r.role.name] as const] : [])));
  const stages = new Map(live.flatMap((b) => (b.stage ? [[b.stage.id, b.stage] as const] : [])));
  const bookingTitle = new Map(live.map((b) => [b.id, b.title] as const));

  const lenses: LensGroup[] = [
    axisOf(rows, 'status', 'Status', [{ key: 'open', label: 'Open' }, { key: 'done', label: 'Done' }]),
    axisOf(rows, 'person', 'Person', valuesSeen(rows, 'person', (k) => personName.get(k) ?? k), { none: 'Unassigned', mostFirst: true }),
    axisOf(rows, 'role', 'Role', valuesSeen(rows, 'role', (k) => roleName.get(k) ?? k), { none: 'No role set', mostFirst: true }),
    axisOf(rows, 'task', 'Task', valuesSeen(rows, 'task', (k) => k), { mostFirst: true }),
    axisOf(rows, 'service', 'Service', valuesSeen(rows, 'service', (k) => k), { none: 'No service' }),
    axisOf(rows, 'package', 'Package', valuesSeen(rows, 'package', (k) => k), { none: 'Added to the booking' }),
    axisOf(rows, 'stage', 'Status', [...stages.values()].map((st) => ({ key: st.id, label: st.name, look: { kind: st.kind, color: st.color } })), { none: 'No stage' }),
    axisOf(rows, 'when', 'When', whenItems(cal)),
    // Bookings soonest first, as liveBookings orders them.
    axisOf(rows, 'booking', 'Booking', live.map((b) => ({ key: b.id, label: bookingTitle.get(b.id) ?? b.id }))),
  ].filter((g) => g.items.length > 0);

  return { rows, lenses, today: cal.today };
}
