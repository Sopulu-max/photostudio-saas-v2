'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

/**
 * WHERE THE WORK IS. Two scales of one thing: a job moving through a sequence.
 *
 * Globally a booking moves through the studio's stages. Locally, inside it,
 * each service of each package moves through its tasks - the video may be
 * done while the photo is still in edit. Both are READINGS of rows that
 * already exist: a local position is a service's first unfinished task, and
 * a service is done when it has none. Nothing here is stored; a stage stays
 * the studio's decision, and the reading only says when that decision has
 * become available.
 */

export type ServiceWork = {
  packageServiceId: string | null;
  serviceName: string;
  total: number;
  done: number;
  /** The first unfinished task, in order - the local position. */
  current: { id: string; name: string; assignee: string | null } | null;
  isDone: boolean;
};

export type LineWork = {
  lineId: string | null;
  packageName: string;
  services: ServiceWork[];
  isDone: boolean;
};

export type BookingWork = {
  lines: LineWork[];
  total: number;
  done: number;
  /** Every task on the booking is finished - the completed stage is available. */
  allDone: boolean;
};

const TASK_SELECT = `
  id, name, position, completed_at, booking_line_id, package_service_id,
  assignee:contacts(display_name),
  line:booking_lines(id, package:packages(name)),
  bundle:package_services(id, service:services(name))
`;

/** Group a booking's task rows into lines and services, in task order. */
function readWork(rows: any[]): BookingWork {
  const byLine = new Map<string, LineWork>();
  const byService = new Map<string, ServiceWork>();
  for (const t of rows) {
    const lineKey = t.booking_line_id ?? '';
    const line: LineWork = byLine.get(lineKey) ?? { lineId: t.booking_line_id ?? null, packageName: t.line?.package?.name ?? 'This booking', services: [], isDone: true };
    byLine.set(lineKey, line);
    const svcKey = `${lineKey}:${t.package_service_id ?? ''}`;
    let svc = byService.get(svcKey);
    if (!svc) {
      svc = { packageServiceId: t.package_service_id ?? null, serviceName: t.bundle?.service?.name ?? (t.booking_line_id ? 'Package' : 'Added here'), total: 0, done: 0, current: null, isDone: true };
      byService.set(svcKey, svc);
      line.services.push(svc);
    }
    svc.total += 1;
    if (t.completed_at) svc.done += 1;
    else {
      svc.isDone = false;
      line.isDone = false;
      if (!svc.current) svc.current = { id: t.id, name: t.name, assignee: t.assignee?.display_name ?? null };
    }
  }
  // A stable order - by service name within a line - so the strip does not
  // reshuffle as tasks complete; task order alone ties on equal positions.
  const lines = [...byLine.values()].map((l) => ({ ...l, services: [...l.services].sort((a, b) => a.serviceName.localeCompare(b.serviceName)) }));
  const total = rows.length;
  const done = rows.filter((t) => t.completed_at).length;
  return { lines, total, done, allDone: total > 0 && done === total };
}

/** The local reading of one booking: each package, each service in it, where it is. */
export async function getBookingWork(bookingId: string): Promise<BookingWork> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('booking_tasks')
    .select(TASK_SELECT)
    .eq('organization_id', orgId)
    .eq('booking_id', bookingId)
    .order('position');
  return readWork((data || []) as any[]);
}

export type WorkSheetRow = {
  bookingId: string;
  title: string;
  clientName: string | null;
  scheduledFor: string | null;
  stage: { name: string; kind: string; color: string | null } | null;
  work: BookingWork;
};

/**
 * The global reading: every live booking with its stage and its local
 * positions. Cancelled and completed bookings carry no work to do, so they are
 * left out; an enquiry with no tasks yet is shown as such rather than hidden,
 * since it is still a job the studio holds.
 */
export async function listWorkSheet(): Promise<WorkSheetRow[]> {
  const { orgId } = await getAuthOrgId();
  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('id, title, scheduled_for, stage:booking_stages(name, kind, color), contact:contacts(display_name)')
    .eq('organization_id', orgId)
    .order('scheduled_for', { ascending: true, nullsFirst: false });
  const live = ((bookings || []) as any[]).filter((b) => !b.stage || b.stage.kind === 'enquiry' || b.stage.kind === 'booked');
  if (live.length === 0) return [];
  const { data: tasks } = await supabaseAdmin
    .from('booking_tasks')
    .select(`booking_id, ${TASK_SELECT}`)
    .eq('organization_id', orgId)
    .in('booking_id', live.map((b) => b.id))
    .order('position');
  const byBooking = new Map<string, any[]>();
  for (const t of ((tasks || []) as any[])) (byBooking.get(t.booking_id) ?? byBooking.set(t.booking_id, []).get(t.booking_id)!).push(t);
  return live.map((b) => ({
    bookingId: b.id as string,
    title: b.title as string,
    clientName: (b.contact?.display_name ?? null) as string | null,
    scheduledFor: (b.scheduled_for ?? null) as string | null,
    stage: b.stage ? { name: b.stage.name, kind: b.stage.kind, color: b.stage.color ?? null } : null,
    work: readWork(byBooking.get(b.id) || []),
  }));
}
