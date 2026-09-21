'use server';

import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { resolveBookingTasks, liveBookings, type ResolvedBookingTask } from './resolve';

/**
 * WHERE THE WORK IS. Two scales of one thing: a job moving through a sequence.
 *
 * Globally a booking moves through the studio's stages. Locally, inside it,
 * each service of each package moves through its tasks - the video may be
 * done while the photo is still in edit. Both are READINGS: a local position
 * is a service's first unfinished task, and a service is done when it has
 * none. The tasks themselves are a reading too (see resolve.ts) - the
 * workflow as it is now, with what happened on this booking laid over it.
 * Nothing here is stored; a stage stays the studio's decision, and the
 * reading only says when that decision has become available.
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

/** Group a booking's tasks into lines and services, in task order. */
function readWork(rows: ResolvedBookingTask[]): BookingWork {
  const byLine = new Map<string, LineWork>();
  const byService = new Map<string, ServiceWork>();
  for (const t of rows) {
    const lineKey = t.lineId ?? '';
    const line: LineWork = byLine.get(lineKey) ?? { lineId: t.lineId, packageName: t.fromPackage ?? 'This booking', services: [], isDone: true };
    byLine.set(lineKey, line);
    const svcKey = `${lineKey}:${t.packageServiceId ?? ''}`;
    let svc = byService.get(svcKey);
    if (!svc) {
      svc = { packageServiceId: t.packageServiceId, serviceName: t.fromService ?? (t.lineId ? 'Package' : 'Added here'), total: 0, done: 0, current: null, isDone: true };
      byService.set(svcKey, svc);
      line.services.push(svc);
    }
    svc.total += 1;
    if (t.done) svc.done += 1;
    else {
      svc.isDone = false;
      line.isDone = false;
      if (!svc.current) svc.current = { id: t.id ?? `${svcKey}:${t.position}`, name: t.name, assignee: t.assignee?.name ?? null };
    }
  }
  // A stable order - by service name within a line - so the strip does not
  // reshuffle as tasks complete; task order alone ties on equal positions.
  const lines = [...byLine.values()].map((l) => ({ ...l, services: [...l.services].sort((a, b) => a.serviceName.localeCompare(b.serviceName)) }));
  const total = rows.length;
  const done = rows.filter((t) => t.done).length;
  return { lines, total, done, allDone: total > 0 && done === total };
}

/** The local reading of one booking: each package, each service in it, where it is. */
export async function getBookingWork(bookingId: string): Promise<BookingWork> {
  const { orgId } = await getAuthOrgId();
  const resolved = await resolveBookingTasks(orgId, [bookingId]);
  return readWork(resolved.get(bookingId) || []);
}
