'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { assertOurs } from '@/kernel/tenancy';
import { resolveBookingTasks, liveBookings, type LiveBooking } from './resolve';

/**
 * THE WORK, BY PERSON.
 *
 * Everything else here runs booking -> people: which roles this job needs,
 * who covers them, where the gaps are. Nothing ran the other way, so "what is
 * Clifford on this week" and "how loaded is each editor" had no answer, and
 * the employee page carried an empty "current work" heading for months.
 *
 * This is the same reading as the Work sheet, turned around. A person's jobs
 * are the live bookings they are crewed on (assignments) or doing a step of
 * (booking_tasks.assignee_id) - two edges, one person, read together so they
 * cannot disagree. A person is two ids on those edges: employees.id on the
 * crew, contacts.id on the task; employees.contact_id is the bridge.
 *
 * A step has no date of its own - it inherits the booking's. That is right
 * for a shoot and says nothing about when the editing happens, so a person's
 * work is given as jobs in date order and open steps as a LOAD, never as a
 * schedule. Nothing is stored.
 */

export type PersonJob = {
  bookingId: string;
  title: string;
  clientName: string | null;
  scheduledFor: string | null;
  stage: { name: string; kind: string; color: string | null } | null;
  /** The roles they are crewed on this booking in. */
  roles: string[];
  /** Their steps on it, in working order. */
  tasks: { id: string; name: string; fromService: string | null; done: boolean }[];
};

export type PersonWork = {
  jobs: PersonJob[];
  open: number;
  done: number;
};

export type PersonLoad = {
  employeeId: string;
  /** Unfinished steps they are on, across live bookings. */
  open: number;
  /** Live bookings they are on, crewed or by a step. */
  jobs: number;
  /** The next dated booking they are on. */
  next: string | null;
};

type Crew = { booking_id: string; employee_id: string; role: { name: string } | null };

/** One open step, on the Work page's by-person reading. */
export type OpenStep = {
  id: string;
  name: string;
  fromService: string | null;
  roleName: string | null;
  bookingId: string;
  bookingTitle: string;
  clientName: string | null;
  scheduledFor: string | null;
  stage: { name: string; kind: string; color: string | null } | null;
};

export type PersonSheetRow = {
  employeeId: string;
  name: string;
  avatarUrl: string | null;
  roles: string[];
  /** Their unfinished steps, soonest booking first. */
  open: OpenStep[];
  /** Live bookings they are on, crewed or by a step. */
  jobs: number;
};

export type WorkByPerson = {
  people: PersonSheetRow[];
  /** Steps on live bookings that nobody is on - where the studio is short. */
  unstaffed: OpenStep[];
};

/** Everyone's involvement on the live bookings, keyed by employee id. */
async function readPeople(orgId: string): Promise<{ live: LiveBooking[]; byEmployee: Map<string, PersonJob[]> }> {
  const live = await liveBookings(orgId);
  const byEmployee = new Map<string, PersonJob[]>();
  if (live.length === 0) return { live, byEmployee };
  const liveIds = live.map((b) => b.id);

  const [{ data: employees }, { data: crew }, tasks] = await Promise.all([
    supabaseAdmin.from('employees').select('id, contact_id').eq('organization_id', orgId),
    supabaseAdmin.from('assignments').select('booking_id, employee_id, role:roles(name)')
      .eq('organization_id', orgId).in('booking_id', liveIds),
    resolveBookingTasks(orgId, liveIds),
  ]);
  const employeeByContact = new Map<string, string>();
  for (const e of (employees || []) as { id: string; contact_id: string | null }[]) {
    if (e.contact_id) employeeByContact.set(e.contact_id, e.id);
  }

  const jobFor = (employeeId: string, b: LiveBooking): PersonJob => {
    const jobs = byEmployee.get(employeeId) ?? [];
    byEmployee.set(employeeId, jobs);
    let job = jobs.find((j) => j.bookingId === b.id);
    if (!job) {
      job = {
        bookingId: b.id, title: b.title, clientName: b.clientName, scheduledFor: b.scheduledFor, stage: b.stage,
        roles: [], tasks: [],
      };
      jobs.push(job);
    }
    return job;
  };
  const byId = new Map(live.map((b) => [b.id, b]));

  for (const a of (crew || []) as unknown as Crew[]) {
    const b = byId.get(a.booking_id);
    if (!b) continue;
    const job = jobFor(a.employee_id, b);
    const role = a.role?.name ?? 'No role set';
    if (!job.roles.includes(role)) job.roles.push(role);
  }
  for (const b of live) {
    for (const t of tasks.get(b.id) || []) {
      if (!t.assignee) continue;
      const employeeId = employeeByContact.get(t.assignee.id);
      if (!employeeId) continue;
      jobFor(employeeId, b).tasks.push({ id: t.id ?? `${t.lineId}:${t.position}`, name: t.name, fromService: t.fromService, done: t.done });
    }
  }
  return { live, byEmployee };
}

/** One person's live jobs, and their steps on each. */
export async function getEmployeeWork(employeeId: string): Promise<PersonWork> {
  const { orgId } = await getAuthOrgId();
  await assertOurs(orgId, [{ table: 'employees', id: employeeId, label: 'employee' }]);
  const { byEmployee } = await readPeople(orgId);
  const jobs = byEmployee.get(employeeId) || [];
  const all = jobs.flatMap((j) => j.tasks);
  return {
    jobs,
    open: all.filter((t) => !t.done).length,
    done: all.filter((t) => t.done).length,
  };
}

/** Everyone's load, for the team list. Nobody on nothing is left out. */
export async function listWorkLoad(): Promise<PersonLoad[]> {
  const { orgId } = await getAuthOrgId();
  const { byEmployee } = await readPeople(orgId);
  return [...byEmployee.entries()].map(([employeeId, jobs]) => ({
    employeeId,
    open: jobs.reduce((n, j) => n + j.tasks.filter((t) => !t.done).length, 0),
    jobs: jobs.length,
    next: jobs.map((j) => j.scheduledFor).filter((d): d is string => Boolean(d) && new Date(d!) >= new Date(new Date().toDateString())).sort()[0] ?? null,
  }));
}

/**
 * The Work page's other reading: everyone, with what they are carrying, and
 * at the end the steps nobody is on. One pass over the live bookings.
 */
export async function listWorkByPerson(): Promise<WorkByPerson> {
  const { orgId } = await getAuthOrgId();
  const live = await liveBookings(orgId);
  const liveIds = live.map((b) => b.id);
  const [{ data: employees }, { data: crew }, tasks] = await Promise.all([
    supabaseAdmin.from('employees')
      .select('id, contact_id, status, contact:contacts(display_name, avatar_url), employee_roles(role:roles(name))')
      .eq('organization_id', orgId).eq('status', 'active'),
    liveIds.length > 0
      ? supabaseAdmin.from('assignments').select('booking_id, employee_id, role:roles(name)')
          .eq('organization_id', orgId).in('booking_id', liveIds)
      : Promise.resolve({ data: [] as any[] }),
    liveIds.length > 0 ? resolveBookingTasks(orgId, liveIds) : Promise.resolve(new Map()),
  ]);

  const rows = new Map<string, PersonSheetRow>();
  const byContact = new Map<string, string>();
  for (const e of (employees || []) as any[]) {
    rows.set(e.id, {
      employeeId: e.id,
      name: e.contact?.display_name ?? 'Unnamed',
      avatarUrl: e.contact?.avatar_url ?? null,
      roles: ((e.employee_roles || []) as any[]).map((er) => er.role?.name).filter(Boolean),
      open: [],
      jobs: 0,
    });
    if (e.contact_id) byContact.set(e.contact_id, e.id);
  }

  const jobsOf = new Map<string, Set<string>>();
  const onJob = (employeeId: string, bookingId: string) => {
    const set = jobsOf.get(employeeId) ?? new Set<string>();
    set.add(bookingId);
    jobsOf.set(employeeId, set);
  };
  for (const a of (crew || []) as unknown as Crew[]) if (rows.has(a.employee_id)) onJob(a.employee_id, a.booking_id);

  const unstaffed: OpenStep[] = [];
  for (const b of live) {
    for (const t of (tasks as Map<string, any[]>).get(b.id) || []) {
      if (t.done) continue;
      const step: OpenStep = {
        id: t.id ?? `${t.lineId}:${t.packageServiceId}:${t.position}`,
        name: t.name, fromService: t.fromService, roleName: t.roleName,
        bookingId: b.id, bookingTitle: b.title, clientName: b.clientName, scheduledFor: b.scheduledFor, stage: b.stage,
      };
      const employeeId = t.assignee ? byContact.get(t.assignee.id) : undefined;
      const row = employeeId ? rows.get(employeeId) : undefined;
      if (row) {
        row.open.push(step);
        onJob(row.employeeId, b.id);
      } else {
        unstaffed.push(step);
      }
    }
  }
  for (const [employeeId, set] of jobsOf) {
    const row = rows.get(employeeId);
    if (row) row.jobs = set.size;
  }

  // The busiest first; people on nothing after, so a free pair of hands is
  // visible beside the overloaded ones.
  const people = [...rows.values()].sort((a, b) => b.open.length - a.open.length || b.jobs - a.jobs || a.name.localeCompare(b.name));
  return { people, unstaffed };
}
